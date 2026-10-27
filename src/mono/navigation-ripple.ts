import * as THREE from 'three';
import { blockKey, type BlockData } from './blocks';
import { CONFIG } from './config';

export class NavigationRipple extends THREE.Group {
  private elapsed = 1;
  private readonly viewport = new THREE.Vector2();
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { center: { value: new THREE.Vector3() }, progress: { value: 0 }, thickness: { value: CONFIG.thickness } },
    vertexShader: `varying vec3 surface_position;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        surface_position = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform vec3 center; uniform float progress; uniform float thickness;
      varying vec3 surface_position;
      void main() {
        if (abs(surface_position.y - center.y) > 0.2) discard;
        float radius = length(surface_position.xz - center.xz);
        float edge = abs(radius - mix(3.0, 36.0, progress));
        float screen_distance = edge / max(length(vec2(dFdx(radius), dFdy(radius))), 0.000001);
        float coverage = clamp(thickness * 0.5 + 0.5 - screen_distance, 0.0, 1.0);
        if (coverage <= 0.0) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, coverage * (1.0 - progress));
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });

  public constructor(blocks: readonly BlockData[]) {
    super(); this.name = 'NavigationRipple'; this.visible = false;
    const occupied = new Set(blocks.map((block) => blockKey(block.gx, block.gy, block.gz)));
    const geometry = new THREE.PlaneGeometry(40, 40);
    const surfaces = blocks.filter((block) => block.type === 'standard' && !occupied.has(blockKey(block.gx, block.gy + 1, block.gz)));
    const mesh = new THREE.InstancedMesh(geometry, this.material, surfaces.length);
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      this.material.uniforms.thickness.value = CONFIG.thickness * Math.abs(camera.projectionMatrix.elements[5])
        * renderer.getDrawingBufferSize(this.viewport).y / 2;
    };
    surfaces.forEach((block, index) => mesh.setMatrixAt(index, new THREE.Matrix4()
      .makeRotationX(-Math.PI / 2).setPosition(block.gx * 40, block.gy * 40 + 20.05, block.gz * 40)));
    this.add(mesh);
  }

  public show(position: THREE.Vector3): void {
    this.material.uniforms.center.value.copy(position);
    this.material.uniforms.progress.value = 0;
    this.elapsed = 0; this.visible = true;
  }

  public update(delta: number): void {
    this.elapsed += delta;
    this.material.uniforms.progress.value = Math.min(1, this.elapsed / 0.65);
    this.visible = this.elapsed < 0.65;
  }
}
