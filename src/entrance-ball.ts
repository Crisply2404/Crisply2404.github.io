import * as THREE from 'three';
import { CONFIG, PHYSICS, VIEWPORT, movementDirection } from './mono/config';
import { VisualBuilder } from './mono/objects';
import { MonoRenderer } from './mono/renderer';
import { GameCursor } from './mono/game-cursor';
import { PlayerState } from './mono/physics';
import { PageLetters } from './page-letters';
import { readPagePlayState, savePagePlayState } from './page-play-state';

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
  private readonly letters: PageLetters;
  private readonly shell: HTMLElement;
  private readonly rows: HTMLElement[];
  private tapStart: { id: number; x: number; y: number } | undefined;
  private tapTarget: THREE.Vector2 | undefined;
  private readonly keys = new Set<string>();
  private readonly player = new PlayerState();
  private readonly position = this.player.pos;
  private readonly velocity = this.player.vel;
  private readonly shards = new THREE.Group();
  private readonly pushed = new THREE.Vector2();
  private readonly screenOffset = new THREE.Vector2();
  private selectedRow: HTMLElement;
  private animationFrame = 0;
  private previousTime = performance.now();
  private accumulator = 0;
  private targetAngle = Math.PI / 4;
  private cameraAngle = Math.PI / 4;
  private brokenAt: number | undefined;
  private displaced = false;
  private jumpPressed = false;
  private unitsPerPixel = CONFIG.playerRadius * 2 / 24;
  private cursorBlocked = false;
  private lastCursorPosition = new THREE.Vector2(Number.NaN, Number.NaN);

  public constructor(private readonly root: HTMLElement) {
    this.rows = root.matches('.entrance-list') ? [...root.querySelectorAll<HTMLElement>('.entry-row')] : [];
    if (!this.rows.length) {
      const heading = root.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6');
      if (!heading) throw new Error('Page title is unavailable');
      this.rows = [heading];
    }
    const saved = readPagePlayState();
    this.selectedRow = this.rows[Math.min(saved?.selected ?? 0, this.rows.length - 1)];
    this.shell = root.closest<HTMLElement>('.site-shell')!;
    this.canvas.className = 'entrance-ball';
    this.canvas.setAttribute('aria-hidden', 'true');
    root.append(this.canvas);
    document.body.classList.add('list-cursor-mode');
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
    for (const row of this.rows) {
      const select = (): void => {
        this.selectRow(row);
      };
      row.addEventListener('pointerenter', select, { signal: this.listeners.signal });
      row.addEventListener('focus', select, { signal: this.listeners.signal });
    }
    window.addEventListener('keydown', this.keyDown, { signal: this.listeners.signal });
    window.addEventListener('keyup', this.keyUp, { signal: this.listeners.signal });
    window.addEventListener('blur', this.clearInput, { signal: this.listeners.signal });
    window.addEventListener('resize', this.resize, { signal: this.listeners.signal });
    window.addEventListener('pointermove', this.pointerMove, { signal: this.listeners.signal });
    document.addEventListener('pointerleave', this.pointerLeave, { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', this.clearInput, { signal: this.listeners.signal });
    this.shell.addEventListener('pointerdown', this.pointerDown, { signal: this.listeners.signal });
    this.shell.addEventListener('pointerup', this.pointerUp, { signal: this.listeners.signal });
    this.shell.addEventListener('pointercancel', () => { this.tapStart = undefined; }, { signal: this.listeners.signal });
    this.resize();
    this.letters = new PageLetters(this.shell, saved?.letters, (element) => {
      if (this.rows.includes(element)) this.selectRow(element);
    });
    if (saved) { this.screenOffset.set(saved.ball.x, saved.ball.y); this.displaced = true; this.placeBall(); }
    this.resizeObserver.observe(root);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    savePagePlayState({ selected: this.rows.indexOf(this.selectedRow),
      ball: { x: this.screenOffset.x + this.pushed.x, y: this.screenOffset.y + this.pushed.y }, letters: this.letters.snapshot() });
    this.listeners.abort();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.letters.destroy();
    const geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    this.builder.dispose();
    this.rendering.dispose();
    this.cursor.destroy();
    document.body.classList.remove('list-cursor-mode');
    this.canvas.remove();
  }

  private readonly resize = (): void => {
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
    if (this.displaced) this.placeBall();
    else this.canvas.style.transform = `translate(0, ${this.baseY()}px)`;
    this.letters?.resize();
    this.letters?.relocateBall(this.documentCenter());
  };

  private returnToAnchor(): void {
    this.player.place(new THREE.Vector3());
    this.player.grounded = true;
    this.pushed.set(0, 0);
    this.screenOffset.set(0, 0);
    this.displaced = false;
    this.canvas.getBoundingClientRect();
    this.canvas.style.transition = '';
    this.canvas.style.transform = `translate(0, ${this.baseY()}px)`;
    this.tapTarget = undefined;
    if (this.letters) this.letters.relocateBall(this.documentCenter());
  }

  private selectRow(row: HTMLElement): void {
    if (this.selectedRow === row) return;
    this.selectedRow = row;
    this.clearInput();
    this.returnToAnchor();
  }

  private baseY(): number {
    const title = this.selectedRow.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    return title.top - root.top + (title.height - this.canvas.clientHeight) / 2;
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
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
    const previousAngle = this.cameraAngle;
    this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.targetAngle, 18, delta);
    this.velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraAngle - previousAngle);
    this.viewCamera.position.set(Math.sin(this.cameraAngle) * VIEWPORT.cameraDistance, VIEWPORT.cameraHeight,
      Math.cos(this.cameraAngle) * VIEWPORT.cameraDistance);
    this.viewCamera.lookAt(0, 0, 0);
    this.viewCamera.updateMatrixWorld();
    this.cursor.setAngle(this.cameraAngle);
    while (this.accumulator >= 1 / 60) { this.step(); this.accumulator -= 1 / 60; }
    if (this.brokenAt !== undefined) this.animateShards(now);
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private step(): void {
    if (this.brokenAt !== undefined) { this.letters.step(this.documentCenter(), false); return; }
    const previousPosition = this.position.clone();
    this.player.consumeJump();
    const x = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    const z = Number(this.keys.has('s')) - Number(this.keys.has('w'));
    if (x || z) {
      this.tapTarget = undefined;
      const [worldX, worldZ] = movementDirection(x, z, this.cameraAngle, 2);
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
    if (this.tapTarget) {
      const delta = this.tapTarget.clone().sub(this.documentCenter());
      const distance = delta.length();
      if (distance < 0.5) this.tapTarget = undefined;
      else {
        this.screenOffset.addScaledVector(delta.normalize(), Math.min(distance, Math.max(0.5, Math.min(3.2, distance * 0.14))));
        this.displaced = true;
      }
    }
    if (this.displaced) this.placeBall();
    this.collideCursor();
    this.letters.step(this.documentCenter(), this.brokenAt === undefined);
    const requiredHeight = Math.ceil(Math.max(innerHeight, this.documentCenter().y + 48, this.letters.bottom + 48));
    if (requiredHeight > this.shell.offsetHeight) this.shell.style.minHeight = `${requiredHeight}px`;
  }

  private placeBall(): void {
    const x = this.screenOffset.x + this.pushed.x;
    const y = this.screenOffset.y + this.pushed.y;
    const bounds = this.root.getBoundingClientRect();
    const baseLeft = bounds.left + this.canvas.offsetLeft;
    const displayedX = THREE.MathUtils.clamp(x, 16 - baseLeft, innerWidth - 48 - baseLeft);
    const displayedY = this.baseY() + y;
    this.canvas.style.transition = 'none';
    this.canvas.style.transform = `translate(${displayedX}px, ${displayedY}px)`;
  }

  private readonly pointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.cursor.hide();
      if (this.tapStart && Math.hypot(event.clientX - this.tapStart.x, event.clientY - this.tapStart.y) > 10) this.tapStart = undefined;
      return;
    }
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

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    if (this.tapStart) { this.tapStart = undefined; return; }
    this.tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const start = this.tapStart;
    this.tapStart = undefined;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    if ((event.target as HTMLElement).closest('a, button, .page-link-letter')) return;
    const bounds = this.shell.getBoundingClientRect();
    this.tapTarget = new THREE.Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    this.clearInput();
    this.canvas.style.transition = 'none';
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

  private documentCenter(): THREE.Vector2 {
    const point = this.ballCenter();
    const bounds = this.shell.getBoundingClientRect();
    return point.sub(new THREE.Vector2(bounds.left, bounds.top));
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
    const rows = this.rows;
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
