import * as THREE from 'three';
import { CONFIG, PHYSICS, VIEWPORT, controlModeOrder, movementDirection, type WasdOrientation } from './mono/config';
import { VisualBuilder } from './mono/objects';
import { MonoRenderer } from './mono/renderer';
import { GameCursor } from './mono/game-cursor';
import { ControlPreview } from './mono/control-preview';
import { PlayerState } from './mono/physics';

export class EntranceBall {
  private readonly canvas = document.createElement('canvas');
  private readonly rendering = new MonoRenderer(this.canvas, true);
  private readonly builder = new VisualBuilder(this.rendering);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly ball = this.builder.createPlayerMesh();
  private readonly listeners = new AbortController();
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private readonly cursor = new GameCursor();
  private readonly preview: ControlPreview;
  private readonly keys = new Set<string>();
  private readonly player = new PlayerState();
  private readonly position = this.player.pos;
  private readonly velocity = this.player.vel;
  private readonly shards = new THREE.Group();
  private readonly pushed = new THREE.Vector2();
  private readonly screenOffset = new THREE.Vector2();
  private selectedRow: HTMLAnchorElement;
  private animationFrame = 0;
  private previousTime = performance.now();
  private accumulator = 0;
  private targetAngle = Math.PI / 4;
  private cameraAngle = Math.PI / 4;
  private movementAngle = Math.PI / 4;
  private orientation: WasdOrientation = 2;
  private wasMoving = false;
  private brokenAt: number | undefined;
  private displaced = false;
  private jumpPressed = false;
  private unitsPerPixel = CONFIG.playerRadius * 2 / 24;
  private cursorBlocked = false;
  private lastCursorPosition = new THREE.Vector2(Number.NaN, Number.NaN);

  public constructor(private readonly root: HTMLElement) {
    const rows = root.querySelectorAll<HTMLAnchorElement>('.entry-row');
    if (!rows.length) throw new Error('Site entrances are unavailable');
    this.selectedRow = rows[0];
    const stored = Number(localStorage.getItem('mono-wasd-orientation') ?? 2);
    if (!controlModeOrder.includes(stored as WasdOrientation)) throw new Error('Invalid WASD orientation');
    this.orientation = stored as WasdOrientation;
    this.canvas.className = 'entrance-ball';
    this.canvas.setAttribute('aria-hidden', 'true');
    root.append(this.canvas);
    document.body.classList.add('list-cursor-mode');
    this.preview = new ControlPreview(root);
    this.camera.position.z = 1000;
    this.scene.add(this.ball, this.shards);
    for (let index = 0; index < 8; index += 1) {
      const points = Array.from({ length: 5 }, (_, step) => {
        const angle = index * Math.PI / 4 + step * Math.PI / 24;
        return new THREE.Vector3(Math.cos(angle) * CONFIG.playerRadius, Math.sin(angle) * CONFIG.playerRadius, 0);
      });
      this.shards.add(this.builder.createStroke(points.slice(1).map((point, step) => [points[step], point])));
    }
    this.shards.visible = false;
    for (const row of rows) {
      const select = (): void => {
        if (this.selectedRow === row) return;
        this.selectedRow = row;
        this.clearInput();
        this.returnToAnchor();
      };
      row.addEventListener('pointerenter', select, { signal: this.listeners.signal });
      row.addEventListener('focus', select, { signal: this.listeners.signal });
    }
    window.addEventListener('keydown', this.keyDown, { signal: this.listeners.signal });
    window.addEventListener('keyup', this.keyUp, { signal: this.listeners.signal });
    window.addEventListener('blur', this.clearInput, { signal: this.listeners.signal });
    window.addEventListener('pointermove', this.pointerMove, { signal: this.listeners.signal });
    document.addEventListener('pointerleave', this.pointerLeave, { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', this.clearInput, { signal: this.listeners.signal });
    this.resize();
    this.resizeObserver.observe(root);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    this.listeners.abort();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.preview.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    this.builder.dispose();
    this.rendering.dispose();
    this.cursor.destroy();
    document.body.classList.remove('list-cursor-mode');
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
    this.viewCamera.top = 400;
    this.viewCamera.bottom = -400;
    this.viewCamera.left = -400 * innerWidth / innerHeight;
    this.viewCamera.right = -this.viewCamera.left;
    this.viewCamera.updateProjectionMatrix();
    this.rendering.resize(width, height);
    this.rendering.render(this.scene, this.camera);
    this.returnToAnchor();
  }

  private returnToAnchor(): void {
    this.player.place(new THREE.Vector3());
    this.player.grounded = true;
    this.pushed.set(0, 0);
    this.screenOffset.set(0, 0);
    this.displaced = false;
    this.canvas.getBoundingClientRect();
    this.canvas.style.transition = '';
    this.canvas.style.transform = `translate(0, ${this.baseY()}px)`;
  }

  private baseY(): number {
    return this.selectedRow.offsetTop + (this.selectedRow.offsetHeight - this.canvas.clientHeight) / 2;
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'tab') {
      this.orientation = controlModeOrder[(controlModeOrder.indexOf(this.orientation) + 1) % controlModeOrder.length];
      localStorage.setItem('mono-wasd-orientation', String(this.orientation));
      this.preview.show(this.orientation);
      this.clearInput();
      return;
    }
    if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', ' ', 'r'].includes(key)) return;
    event.preventDefault();
    if (key === 'q' || key === 'arrowleft') this.targetAngle += Math.PI / 2;
    else if (key === 'e' || key === 'arrowright') this.targetAngle -= Math.PI / 2;
    else if (key === 'r') this.respawn();
    else if (key === ' ') {
      this.player.jump(true, this.jumpPressed);
      this.jumpPressed = true;
      this.displaced = true;
    }
    else this.keys.add(key);
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    if (key === ' ') {
      this.player.jump(false, this.jumpPressed);
      this.jumpPressed = false;
    }
  };

  private readonly clearInput = (): void => { this.keys.clear(); this.jumpPressed = false; this.player.jumpBuffer = 0; };

  private readonly frame = (now: number): void => {
    const delta = Math.min((now - this.previousTime) / 1000, 0.1);
    this.previousTime = now;
    this.accumulator += delta;
    this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.targetAngle, 18, delta);
    this.viewCamera.position.set(Math.sin(this.cameraAngle) * VIEWPORT.cameraDistance, VIEWPORT.cameraHeight,
      Math.cos(this.cameraAngle) * VIEWPORT.cameraDistance);
    this.viewCamera.lookAt(0, 0, 0);
    this.viewCamera.updateMatrixWorld();
    this.cursor.setAngle(this.cameraAngle);
    while (this.accumulator >= 1 / 60) { this.step(); this.accumulator -= 1 / 60; }
    this.preview.update(this.viewCamera, this.targetAngle, delta, 800);
    if (this.brokenAt !== undefined) this.animateShards(now);
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private step(): void {
    if (this.brokenAt !== undefined) return;
    const previousPosition = this.position.clone();
    this.player.consumeJump();
    const x = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    const z = Number(this.keys.has('s')) - Number(this.keys.has('w'));
    if (x || z) {
      if (!this.wasMoving) this.movementAngle = this.targetAngle;
      const [worldX, worldZ] = movementDirection(x, z, this.movementAngle, this.orientation);
      this.velocity.add(new THREE.Vector3(worldX, 0, worldZ).normalize().multiplyScalar(CONFIG.moveSpeed));
      this.displaced = true;
    }
    this.velocity.x *= CONFIG.friction;
    this.velocity.z *= CONFIG.friction;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > CONFIG.maxSpeed) { this.velocity.x *= CONFIG.maxSpeed / speed; this.velocity.z *= CONFIG.maxSpeed / speed; }
    this.velocity.y -= CONFIG.gravity;
    this.position.add(this.velocity);
    this.player.grounded = this.position.y <= 0;
    if (this.player.grounded) {
      this.position.y = this.velocity.y = 0;
      this.player.coyoteTime = PHYSICS.coyoteFrames;
    } else if (this.player.coyoteTime > 0) this.player.coyoteTime -= 1;
    this.player.consumeJump();
    if (this.player.jumpBuffer > 0) this.player.jumpBuffer -= 1;
    const motion = this.position.clone().sub(previousPosition);
    const right = new THREE.Vector3().setFromMatrixColumn(this.viewCamera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.viewCamera.matrixWorld, 1);
    this.screenOffset.x += motion.dot(right) / this.unitsPerPixel;
    this.screenOffset.y -= motion.dot(up) / this.unitsPerPixel;
    this.wasMoving = Boolean(x || z);
    if (this.displaced) this.placeBall();
    this.collideCursor();
  }

  private placeBall(): void {
    const x = this.screenOffset.x + this.pushed.x;
    const y = this.screenOffset.y + this.pushed.y;
    const bounds = this.root.getBoundingClientRect();
    const baseLeft = bounds.left + this.canvas.offsetLeft;
    const displayedX = THREE.MathUtils.clamp(x, 16 - baseLeft, innerWidth - 48 - baseLeft);
    const displayedY = THREE.MathUtils.clamp(this.baseY() + y, 84 - bounds.top, innerHeight - 48 - bounds.top);
    this.canvas.style.transition = 'none';
    this.canvas.style.transform = `translate(${displayedX}px, ${displayedY}px)`;
  }

  private readonly pointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') { this.cursor.hide(); return; }
    const target = new THREE.Vector2(event.clientX, event.clientY);
    const previous = this.lastCursorPosition;
    const distance = Number.isFinite(previous.x) ? previous.distanceTo(target) : 0;
    const steps = Math.max(1, Math.ceil(distance / 4));
    const start = Number.isFinite(previous.x) ? previous.clone() : target;
    for (let index = 1; index <= steps; index += 1) {
      const point = start.clone().lerp(target, index / steps);
      this.cursor.move(point.x, point.y);
      this.collideCursor();
    }
    this.lastCursorPosition.copy(target);
    if (this.cursorBlocked && !this.cursor.contact(this.ballCenter())) {
      this.cursorBlocked = false;
    }
  };

  private readonly pointerLeave = (): void => {
    this.cursor.hide();
    this.lastCursorPosition.set(Number.NaN, Number.NaN);
    this.cursorBlocked = false;
  };

  private ballCenter(): THREE.Vector2 {
    const bounds = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }

  private collideCursor(): void {
    if (this.brokenAt !== undefined) return;
    const contact = this.cursor.contact(this.ballCenter());
    if (!contact) return;
    this.cursorBlocked = true;
    if (contact.kind === 'spike') {
      this.brokenAt = performance.now();
      this.ball.visible = false;
      this.shards.visible = true;
      this.canvas.classList.add('is-broken');
      this.clearInput();
      return;
    }
    this.pushed.addScaledVector(contact.normal, -contact.distance + 0.2);
    this.displaced = true;
    this.velocity.set(0, 0, 0);
    this.placeBall();
  }

  private respawn(): void {
    const center = this.ballCenter();
    const rows = [...this.root.querySelectorAll<HTMLAnchorElement>('.entry-row')];
    this.selectedRow = rows.reduce((nearest, row) => {
      const distance = (item: HTMLElement): number => {
        const bounds = item.getBoundingClientRect();
        return Math.abs(bounds.top + bounds.height / 2 - center.y);
      };
      return distance(row) < distance(nearest) ? row : nearest;
    }, rows[0]);
    this.brokenAt = undefined;
    this.ball.visible = true;
    this.shards.visible = false;
    this.canvas.classList.remove('is-broken');
    this.clearInput();
    this.returnToAnchor();
    this.rendering.render(this.scene, this.camera);
  }

  private animateShards(now: number): void {
    const phase = Math.min((now - this.brokenAt!) / 280, 1);
    this.shards.children.forEach((piece, index) => {
      const angle = index * Math.PI / 4;
      piece.position.set(Math.cos(angle) * phase * 8, Math.sin(angle) * phase * 8, 0);
      piece.rotation.z = phase * (index % 2 ? 1 : -1);
      piece.scale.setScalar(1 - phase);
    });
    this.rendering.render(this.scene, this.camera);
    if (phase === 1 && !this.cursor.contact(this.ballCenter())) {
      this.cursorBlocked = false;
      this.respawn();
    }
  }
}
