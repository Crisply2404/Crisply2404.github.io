import * as THREE from 'three';
import { CONFIG } from './mono/config';
import { VisualBuilder } from './mono/objects';
import { MonoRenderer } from './mono/renderer';

export class EntranceBall {
  private readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas, true);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly ball = this.builder.createPlayerMesh();
  private readonly listeners = new AbortController();
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private selectedRow: HTMLAnchorElement;

  public constructor(root: HTMLElement) {
    const rows = root.querySelectorAll<HTMLAnchorElement>('.entry-row');
    if (!rows.length) throw new Error('Site entrances are unavailable');
    this.selectedRow = rows[0];
    this.canvas.className = 'entrance-ball';
    this.canvas.setAttribute('aria-hidden', 'true');
    root.append(this.canvas);
    this.scene.add(this.ball);
    this.camera.position.z = 1000;
    for (const row of rows) {
      const select = (): void => { this.selectedRow = row; this.move(); };
      row.addEventListener('pointerenter', select, { signal: this.listeners.signal });
      row.addEventListener('focus', select, { signal: this.listeners.signal });
    }
    this.resize();
    this.resizeObserver.observe(root);
  }

  public destroy(): void {
    this.listeners.abort();
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>();
    this.ball.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    this.builder.dispose();
    this.rendering.dispose();
    this.canvas.remove();
  }

  private resize(): void {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const unitsPerPixel = CONFIG.playerRadius * 2 / 24;
    this.camera.left = -width * unitsPerPixel / 2;
    this.camera.right = -this.camera.left;
    this.camera.top = height * unitsPerPixel / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    this.rendering.resize(width, height);
    this.rendering.render(this.scene, this.camera);
    this.move();
  }

  private move(): void {
    const y = this.selectedRow.offsetTop + (this.selectedRow.offsetHeight - this.canvas.clientHeight) / 2;
    this.canvas.style.transform = `translateY(${y}px)`;
  }
}
