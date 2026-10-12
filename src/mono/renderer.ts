import * as THREE from 'three';
import { CONFIG } from './config';
import coverage from './shaders/coverage.glsl?raw';
import distance from './shaders/distance.glsl?raw';
import strokeVertex from './shaders/stroke.vert.glsl?raw';
import strokeFragment from './shaders/stroke.frag.glsl?raw';
import playerVertex from './shaders/player.vert.glsl?raw';
import playerFragment from './shaders/player.frag.glsl?raw';
import flagVertex from './shaders/flag.vert.glsl?raw';
import flagFragment from './shaders/flag.frag.glsl?raw';
import panelVertex from './shaders/panel.vert.glsl?raw';
import panelFragment from './shaders/panel.frag.glsl?raw';

function include(source: string, functions: string): string {
  return source.replace('void main()', `${functions}\nvoid main()`);
}

export class MonoRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly stroke: THREE.ShaderMaterial;
  public readonly playerFill: THREE.ShaderMaterial;
  public readonly playerOutline: THREE.ShaderMaterial;
  public readonly gatePanel: THREE.ShaderMaterial;
  public readonly sitePanel: THREE.ShaderMaterial;
  public readonly doorSymbol: THREE.ShaderMaterial;
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  private readonly baseTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  private readonly viewport = new THREE.Vector2(1, 1);
  private readonly inverseProjection = new THREE.Matrix4();
  private readonly projection = new THREE.Matrix4();
  private readonly materials = new Set<THREE.Material>();
  private readonly copyScene = new THREE.Scene();
  private readonly copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  public constructor(canvas: HTMLCanvasElement, transparent = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.baseTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.baseTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.stroke = this.shader(strokeVertex, include(strokeFragment, coverage));
    this.playerFill = this.shader(playerVertex, include(playerFragment, coverage));
    this.playerOutline = this.shader(playerVertex, include(playerFragment, coverage));
    this.playerOutline.defines = { PLAYER_OUTLINE: 1 };
    this.playerOutline.uniforms.scene_depth.value = this.baseTarget.depthTexture;
    this.gatePanel = this.shader(panelVertex, include(panelFragment, distance), { panel_size: { value: new THREE.Vector2(58, 72) } });
    this.sitePanel = this.shader(
      'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      'uniform sampler2D base_scene; uniform vec2 viewport_size; void main() { if (texture2D(base_scene, gl_FragCoord.xy / viewport_size).a < 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
      { base_scene: { value: this.baseTarget.texture } },
    );
    this.doorSymbol = this.shader(strokeVertex, include(strokeFragment, coverage), {
      base_scene: { value: this.baseTarget.texture },
      stroke_width: { value: 1.5 },
    });
    this.doorSymbol.defines = { DOOR_SYMBOL: 1 };
    const copyMaterial = new THREE.ShaderMaterial({
      uniforms: { image: { value: this.target.texture }, surface_depth: { value: this.target.depthTexture } },
      defines: transparent ? { TRANSPARENT_BACKGROUND: 1 } : {},
      vertexShader: 'varying vec2 screen_uv; void main() { screen_uv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D image;
        uniform sampler2D surface_depth;
        varying vec2 screen_uv;
        void main() {
          float alpha = 1.0;
          #ifdef TRANSPARENT_BACKGROUND
            alpha = texture2D(surface_depth, screen_uv).r < 1.0 ? 1.0 : 0.0;
          #endif
          gl_FragColor = vec4(texture2D(image, screen_uv).rgb, alpha);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.materials.add(copyMaterial);
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial));
  }

  public createFlagMaterial(): THREE.ShaderMaterial {
    return this.shader(flagVertex, include(flagFragment, coverage + distance), { filled: { value: false } });
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.viewport);
    this.target.setSize(this.viewport.x, this.viewport.y);
    this.baseTarget.setSize(this.viewport.x, this.viewport.y);
  }

  public render(scene: THREE.Scene, camera: THREE.OrthographicCamera): void {
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    this.updateDoorOcclusion(scene, camera);
    this.inverseProjection.copy(camera.projectionMatrixInverse);
    this.projection.copy(camera.projectionMatrix);
    camera.layers.set(0);
    this.renderer.setRenderTarget(this.baseTarget);
    this.renderer.clear(true, true, true);
    this.renderer.render(scene, camera);
    camera.layers.enable(2);
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear(true, true, true);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.copyScene, this.copyCamera);
    camera.layers.set(1);
    this.renderer.render(scene, camera);
    camera.layers.enableAll();
  }

  private updateDoorOcclusion(scene: THREE.Scene, camera: THREE.OrthographicCamera): void {
    const panels: { inverse: THREE.Matrix4; direction: THREE.Vector3 }[] = [];
    const players: THREE.Object3D[] = [];
    const towardCamera = camera.getWorldDirection(new THREE.Vector3()).negate();
    scene.traverseVisible((object) => {
      if (object.userData.playerCenterOcclusion) {
        const inverse = object.matrixWorld.clone().invert();
        panels.push({ inverse, direction: towardCamera.clone().transformDirection(inverse) });
      }
      if (object.name === 'PlayerMesh') players.push(object);
    });
    for (const player of players) {
      const center = player.getWorldPosition(new THREE.Vector3());
      const hidden = panels.some(({ inverse, direction }) => {
        if (Math.abs(direction.z) < 1e-8) return false;
        const point = center.clone().applyMatrix4(inverse);
        const distance = -point.z / direction.z;
        if (distance <= 0) return false;
        point.addScaledVector(direction, distance);
        return Math.abs(point.x) <= 29 && Math.abs(point.y) <= 36;
      });
      player.userData.doorOccluded = hidden;
      for (const child of player.children) child.visible = !hidden;
    }
  }

  public dispose(): void {
    for (const material of this.materials) material.dispose();
    this.copyScene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.target.dispose();
    this.baseTarget.dispose();
    this.renderer.dispose();
  }

  private shader(vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        viewport_size: { value: this.viewport },
        inverse_projection: { value: this.inverseProjection },
        projection: { value: this.projection },
        scene_depth: { value: this.target.depthTexture },
        stroke_width: { value: CONFIG.thickness },
        radius: { value: CONFIG.playerRadius },
        ...extra,
      },
      side: THREE.DoubleSide,
      depthFunc: THREE.LessEqualDepth,
      toneMapped: false,
    });
    this.materials.add(material);
    return material;
  }
}
