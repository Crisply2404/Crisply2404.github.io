import * as THREE from 'three';
import { CONFIG, movementDirection, type WasdOrientation } from './config';
import { VisualBuilder } from './objects';
import { MonoRenderer } from './renderer';

export class ControlDiagram extends THREE.Group {
  private readonly arrow = new THREE.Group();

  public constructor(builder: VisualBuilder) {
    super();
    this.name = 'ControlDiagram';
    const tiles = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1]];
    this.add(builder.createLevelMesh(tiles.map(([gx, gz]) => ({ gx, gy: 0, gz, type: 'standard' })), false));
    const polygon = new THREE.Shape([new THREE.Vector2(0, -15), new THREE.Vector2(11, -2), new THREE.Vector2(5, -2),
      new THREE.Vector2(5, 13), new THREE.Vector2(-5, 13), new THREE.Vector2(-5, -2), new THREE.Vector2(-11, -2)]);
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(polygon), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    fill.rotation.x = Math.PI / 2;
    this.arrow.name = 'DirectionArrow'; this.arrow.add(fill); this.add(this.arrow);
  }

  public setDirection(orientation: WasdOrientation, angle: number): void {
    const [x, z] = movementDirection(0, -1, angle, orientation);
    this.arrow.rotation.y = Math.atan2(-x, -z);
    this.arrow.position.set(orientation === 2 ? 0 : x * 40, 20.8, orientation === 2 ? 0 : z * 40);
  }
}

export class ControlPreview {
  private readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas, true);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly diagram = new ControlDiagram(this.builder);
  private remaining = 0;
  private orientation: WasdOrientation = 0;

  public constructor(root: HTMLElement) {
    this.canvas.className = 'control-preview'; this.canvas.hidden = true; root.append(this.canvas);
    this.scene.add(this.diagram);
  }

  public show(orientation: WasdOrientation): void { this.orientation = orientation; this.remaining = 1.8; this.canvas.hidden = false; }

  public update(sourceCamera: THREE.OrthographicCamera, angle: number, delta: number, sourceHeight: number): void {
    if (this.remaining === 0) return;
    this.remaining = Math.max(0, this.remaining - delta);
    this.canvas.hidden = this.remaining === 0;
    if (this.remaining === 0) return;
    const unitsPerPixel = (sourceCamera.top - sourceCamera.bottom) / (sourceHeight * sourceCamera.zoom);
    const basis = new THREE.Matrix4().makeRotationFromQuaternion(sourceCamera.quaternion);
    const horizontal = new THREE.Vector3().setFromMatrixColumn(basis, 0), vertical = new THREE.Vector3().setFromMatrixColumn(basis, 1);
    const corners = 20 * (Math.abs(horizontal.x) + Math.abs(horizontal.y) + Math.abs(horizontal.z));
    const verticalCorners = 20 * (Math.abs(vertical.x) + Math.abs(vertical.y) + Math.abs(vertical.z));
    const minimumWidth = Math.max(124, Math.ceil(((corners + 40 * Math.max(Math.abs(horizontal.x), Math.abs(horizontal.z))) * 2 + CONFIG.thickness) / unitsPerPixel) + 12);
    const minimumHeight = Math.max(108, Math.ceil(((verticalCorners + 40 * Math.max(Math.abs(vertical.x), Math.abs(vertical.z))) * 2 + CONFIG.thickness) / unitsPerPixel) + 12);
    const maximum = Math.min(240, innerWidth - 24, innerHeight - 24);
    const scale = Math.min(1, maximum / Math.max(minimumWidth, minimumHeight));
    const width = Math.ceil(minimumWidth * scale - 8), height = Math.ceil(minimumHeight * scale - 8);
    this.rendering.resize(width, height); this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.canvas.style.opacity = String(Math.min(1, this.remaining / 0.35));
    this.camera.left = -width * unitsPerPixel / 2; this.camera.right = -this.camera.left;
    this.camera.top = height * unitsPerPixel / 2; this.camera.bottom = -this.camera.top; this.camera.updateProjectionMatrix();
    this.camera.quaternion.copy(sourceCamera.quaternion); this.camera.position.set(0, 0, 1000).applyQuaternion(this.camera.quaternion);
    this.diagram.setDirection(this.orientation, angle);
    this.rendering.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.builder.dispose(); this.rendering.dispose(); this.canvas.remove();
  }
}
