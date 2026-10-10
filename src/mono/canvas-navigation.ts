import * as THREE from 'three';

interface PointerState { position: THREE.Vector2; start: THREE.Vector2 }
export interface ViewGesture { previousCenter: THREE.Vector2; center: THREE.Vector2; scale: number }

export class CanvasNavigation {
  private readonly pointers = new Map<number, PointerState>();
  private readonly abort = new AbortController();
  private gestureUsed = false;

  public constructor(private readonly canvas: HTMLCanvasElement, onTap: (point: THREE.Vector2) => void,
    onGesture: (gesture: ViewGesture) => void) {
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.pointerType !== 'touch' && this.pointers.size)) return;
      const position = new THREE.Vector2(event.clientX, event.clientY);
      this.pointers.set(event.pointerId, { position, start: position.clone() });
      if (this.pointers.size > 1) this.gestureUsed = true;
      canvas.setPointerCapture(event.pointerId); event.preventDefault();
    }, { signal: this.abort.signal });
    canvas.addEventListener('pointermove', (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const before = this.pair();
      pointer.position.set(event.clientX, event.clientY);
      if (pointer.position.distanceTo(pointer.start) > 10) this.gestureUsed = true;
      const after = this.pair();
      if (before && after && before.distance > 0 && after.distance > 0) {
        onGesture({ previousCenter: before.center, center: after.center, scale: after.distance / before.distance });
      }
      event.preventDefault();
    }, { signal: this.abort.signal });
    canvas.addEventListener('pointerup', (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      if (!this.gestureUsed && this.pointers.size === 1
        && pointer.start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) <= 10) {
        onTap(new THREE.Vector2(event.clientX, event.clientY));
      }
      this.pointers.delete(event.pointerId);
      if (!this.pointers.size) this.gestureUsed = false;
    }, { signal: this.abort.signal });
    for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, (event) => {
      this.pointers.delete((event as PointerEvent).pointerId);
      this.gestureUsed = this.pointers.size > 0;
    }, { signal: this.abort.signal });
  }

  public reset(): void {
    for (const id of this.pointers.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.pointers.clear(); this.gestureUsed = false;
  }

  public dispose(): void { this.reset(); this.abort.abort(); }

  private pair(): { center: THREE.Vector2; distance: number } | undefined {
    if (this.pointers.size !== 2) return;
    const [first, second] = [...this.pointers.values()].map((pointer) => pointer.position);
    return { center: first.clone().add(second).multiplyScalar(0.5), distance: first.distanceTo(second) };
  }
}
