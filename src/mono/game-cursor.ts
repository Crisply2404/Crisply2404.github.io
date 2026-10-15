import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG, VIEWPORT } from './config';
import { VisualBuilder } from './objects';
import { MonoRenderer } from './renderer';

export interface CursorContact { kind: 'spike' | 'block'; normal: THREE.Vector2; distance: number }
export const cursorRestitution = 0.65;

export class GameCursor {
  public readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas, true);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-80, 80, 80, -80, 1, 5000);
  private readonly object = this.builder.createLevelMesh([
    { gx: 0, gy: 0, gz: 0, type: 'standard' },
    { gx: 0, gy: 1, gz: 0, type: 'spike' },
  ]);
  private readonly pointer = new THREE.Vector2();
  private readonly hotspot = new THREE.Vector2();
  private readonly shapes = new Map<'spike' | 'block', RAPIER.ConvexPolyhedron>();
  // 球体圆周与光标边缘各占 0.75 像素，接触距离同时包含双方线宽。
  private readonly sphere = new RAPIER.Ball((CONFIG.playerRadius + CONFIG.thickness / 2) * 0.6 + CONFIG.thickness * 0.6 / 2);
  private readonly rotation = { x: 0, y: 0, z: 0, w: 1 };
  private angle = Number.NaN;
  public active = false;

  public constructor() {
    this.canvas.className = 'game-cursor';
    this.canvas.hidden = true;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.scene.add(this.object);
    this.rendering.resize(96, 96);
    this.setAngle(Math.PI / 4);
    document.body.append(this.canvas);
  }

  public setAngle(angle: number): void {
    if (Math.abs(angle - this.angle) < 0.00001) return;
    this.angle = angle;
    this.camera.position.set(Math.sin(angle) * VIEWPORT.cameraDistance, VIEWPORT.cameraHeight,
      Math.cos(angle) * VIEWPORT.cameraDistance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.object.updateMatrixWorld(true);
    this.hotspot.copy(this.project(new THREE.Vector3(0, 60, 0)));
    for (const [kind, name] of [['block', 'BlackBlocks'], ['spike', 'BlackSpikes']] as const) {
      const mesh = this.object.getObjectByName(name) as THREE.InstancedMesh;
      const transform = new THREE.Matrix4();
      mesh.getMatrixAt(0, transform);
      const points = mesh.geometry.getAttribute('position');
      const hull: number[] = [];
      for (let index = 0; index < points.count; index += 1) {
        const point = this.project(new THREE.Vector3().fromBufferAttribute(points, index).applyMatrix4(transform));
        for (const z of [-100, 100]) hull.push(point.x, point.y, z);
      }
      this.shapes.set(kind, new RAPIER.ConvexPolyhedron(new Float32Array(hull)));
    }
    this.rendering.render(this.scene, this.camera);
    this.positionCanvas();
  }

  public move(x: number, y: number): void {
    this.active = true;
    this.canvas.hidden = false;
    this.pointer.set(x, y);
    this.positionCanvas();
  }

  public hide(): void { this.active = false; this.canvas.hidden = true; }

  public contact(center: THREE.Vector2): CursorContact | undefined {
    if (!this.active) return;
    const origin = { x: this.pointer.x - this.hotspot.x, y: this.pointer.y - this.hotspot.y, z: 0 };
    for (const kind of ['spike', 'block'] as const) {
      const hit = this.shapes.get(kind)!.contactShape(origin, this.rotation, this.sphere,
        { x: center.x, y: center.y, z: 0 }, this.rotation, 0);
      if (hit && hit.distance <= 0) {
        return { kind, normal: new THREE.Vector2(hit.normal1.x, hit.normal1.y).normalize(), distance: hit.distance };
      }
    }
  }

  public verticalSeparation(center: THREE.Vector2): number {
    const origin = { x: this.pointer.x - this.hotspot.x, y: this.pointer.y - this.hotspot.y, z: 0 };
    const zero = { x: 0, y: 0, z: 0 };
    const distance = this.canvas.clientHeight + this.sphere.radius * 2;
    const offsets = [-1, 1].map((direction) => {
      const start = { x: center.x, y: center.y + direction * distance, z: 0 };
      const velocity = { x: 0, y: -direction * distance, z: 0 };
      let time = 1;
      for (const shape of this.shapes.values()) {
        const hit = shape.castShape(origin, this.rotation, zero, this.sphere, start, this.rotation, velocity, 0, 1, true);
        if (hit) time = Math.min(time, hit.time_of_impact);
      }
      return direction * distance * (1 - time);
    });
    return Math.abs(offsets[0]) < Math.abs(offsets[1]) ? offsets[0] : offsets[1];
  }

  public destroy(): void {
    this.object.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.builder.dispose();
    this.rendering.dispose();
    this.canvas.remove();
  }

  private project(point: THREE.Vector3): THREE.Vector2 {
    point.project(this.camera);
    return new THREE.Vector2((point.x + 1) * 48, (1 - point.y) * 48);
  }

  private positionCanvas(): void {
    this.canvas.style.transform = `translate(${this.pointer.x - this.hotspot.x}px, ${this.pointer.y - this.hotspot.y}px)`;
  }
}
