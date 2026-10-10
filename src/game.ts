import * as THREE from 'three';
import { PresenceClient } from './presence';
import { checkpointPositions, corridorBlocks, corridorEndZ, corridorFloorY, corridorStartZ, corridorWidth, doors, doorPosition, fixedStep, playerRadius, spawn } from './sceneConfig';
import type { AvatarState, DoorConfig } from './types';
import { CONFIG, VIEWPORT, movementDirection, type WasdOrientation } from './mono/config';
import { VisualBuilder, type CheckpointMarker } from './mono/objects';
import { MonoRenderer } from './mono/renderer';
import { PhysicsEngine, PlayerState, physicsReady } from './mono/physics';
import { SafetyNavigationGraph } from './mono/navigation';
import { MobileControls } from './mono/mobile';
import { ControlPreview } from './mono/control-preview';

type KeyName = 'w' | 'a' | 's' | 'd' | 'q' | 'e' | 'r' | ' ';
interface RemoteAvatar { target: AvatarState; object: THREE.Group }

export class GameScene {
  private readonly root: HTMLElement;
  private readonly onRoute: (path: string) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly canvas: HTMLCanvasElement;
  private readonly rendering: MonoRenderer;
  private readonly visualBuilder: VisualBuilder;
  private readonly localAvatar: THREE.Group;
  private readonly contactMarker: THREE.Group;
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly keys = new Set<KeyName>();
  private readonly listenerAbort = new AbortController();
  private readonly presence: PresenceClient;
  private readonly blocks = corridorBlocks();
  private readonly navigation = new SafetyNavigationGraph(this.blocks);
  private readonly physics = new PhysicsEngine(this.blocks);
  private readonly player = new PlayerState();
  private readonly checkpoints: CheckpointMarker[] = [];
  private readonly doorObjects: THREE.Group[] = [];
  private readonly checkpoint = spawn.clone();
  private readonly mobile: MobileControls;
  private readonly controlPreview: ControlPreview;
  private readonly touchKeys = new Set<string>();
  private checkpointIndex = -1;
  private readonly feedback = document.createElement('p');
  private feedbackRemaining = 0;
  private audio: AudioContext | undefined;
  private readonly doorLinks = document.createElement('nav');
  private animationFrame = 0;
  private previousTime = performance.now();
  private accumulator = 0;
  private cameraAngle = Math.PI / 4;
  private targetCameraAngle = Math.PI / 4;
  private movementCameraAngle = Math.PI / 4;
  private wasMoving = false;
  private jumpPressed = false;
  private automaticJump = false;
  private routePending = false;
  private orientation: WasdOrientation = 0;
  private path: { position: THREE.Vector3; jump: boolean }[] = [];
  private destroyed = false;

  public constructor(root: HTMLElement, onRoute: (path: string) => void) {
    this.root = root; this.onRoute = onRoute;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'scene-canvas'; this.root.append(this.canvas);
    this.rendering = new MonoRenderer(this.canvas); this.visualBuilder = new VisualBuilder(this.rendering);
    this.localAvatar = this.visualBuilder.createPlayerMesh();
    this.contactMarker = this.visualBuilder.createContactMarker();
    this.contactMarker.scale.setScalar(0.3);
    const stored = Number(localStorage.getItem('mono-wasd-orientation') ?? 0);
    if (![0, 1, 2].includes(stored)) throw new Error('Invalid WASD orientation');
    this.orientation = stored as WasdOrientation;
    this.controlPreview = new ControlPreview(root);
    this.buildScene(); this.installInput();
    this.presence = new PresenceClient(import.meta.env.VITE_PRESENCE_WS_URL as string | undefined, (avatars) => this.receiveAvatars(avatars));
    this.mobile = new MobileControls(root, (action, pressed) => {
      if (action === 'rotateLeft' && pressed) this.targetCameraAngle += Math.PI / 2;
      else if (action === 'rotateRight' && pressed) this.targetCameraAngle -= Math.PI / 2;
      else if (action === 'jump') this.setJump(pressed);
      else if (pressed) { this.touchKeys.add(action); this.path = []; } else this.touchKeys.delete(action);
    });
    this.resize(); window.addEventListener('resize', this.resize, { signal: this.listenerAbort.signal });
    void Promise.all([physicsReady, this.visualBuilder.ready()]).then(() => {
      if (!this.destroyed) this.animationFrame = window.requestAnimationFrame(this.frame);
    });
  }

  public destroy(): void {
    this.destroyed = true; this.listenerAbort.abort(); this.presence.destroy(); window.cancelAnimationFrame(this.animationFrame);
    this.mobile.dispose(); this.controlPreview.dispose(); this.physics.dispose(); this.audio?.close();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.visualBuilder.dispose(); this.rendering.dispose(); this.root.replaceChildren();
  }

  private readonly resize = (): void => {
    const width = this.root.clientWidth, height = this.root.clientHeight;
    const aspect = width / Math.max(height, 1), halfHeight = (width < height ? 1000 / aspect : VIEWPORT.frustumSize) / 2;
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect; this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix(); this.rendering.resize(width, height);
  };

  private buildScene(): void {
    this.scene.add(this.visualBuilder.createLevelMesh(this.blocks));
    for (const door of doors) this.addDoor(door);
    const exit = this.visualBuilder.createGate('', new THREE.Vector3(0, 40.02, corridorEndZ + 20));
    exit.rotation.y = 0;
    exit.name = 'CorridorExit';
    this.scene.add(exit);
    for (const position of checkpointPositions) {
      const marker = this.visualBuilder.createCheckpoint(position); this.checkpoints.push(marker); this.scene.add(marker);
    }
    this.localAvatar.position.copy(spawn); this.scene.add(this.localAvatar, this.contactMarker);
    this.player.place(spawn);
    this.feedback.className = 'game-feedback'; this.root.append(this.feedback);
    this.doorLinks.className = 'door-links'; this.doorLinks.setAttribute('aria-label', 'Open door in new tab');
    this.root.append(this.doorLinks);
  }

  private addDoor(door: DoorConfig): void {
    const position = doorPosition(door);
    const number = String(doors.indexOf(door) + 1).padStart(2, '0');
    const group = this.visualBuilder.createGate(door.appearance === 'exit' ? '' : number, position, Math.PI / 2, door.appearance === 'completed');
    this.visualBuilder.addLabel(group, door.title, 94, '#fff', 32, 0.35);
    group.userData.door = door; group.userData.entry = new THREE.Vector3(position.x, corridorFloorY + 20, position.z);
    this.scene.add(group); this.doorObjects.push(group);
    const link = document.createElement('a'); link.href = door.path; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = `${number} ${door.title} ↗`; link.title = `${door.title} · Open in new tab`;
    this.doorLinks.append(link);
  }

  private installInput(): void {
    const keyMap: Record<string, KeyName | undefined> = { w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', arrowleft: 'q', arrowright: 'e', r: 'r', ' ': ' ' };
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (event.key === 'Tab') {
        event.preventDefault(); this.orientation = ((this.orientation + 1) % 3) as WasdOrientation;
        localStorage.setItem('mono-wasd-orientation', String(this.orientation));
        this.resetInput(); this.controlPreview.show(this.orientation); return;
      }
      const key = keyMap[event.key.toLowerCase()]; if (!key) return; event.preventDefault();
      if (key === 'q') this.targetCameraAngle += Math.PI / 2; else if (key === 'e') this.targetCameraAngle -= Math.PI / 2; else if (key === 'r') this.resetPlayer(); else this.keys.add(key);
      if (key === ' ') this.setJump(true);
      if (['w', 'a', 's', 'd'].includes(key)) this.path = [];
      this.audio ??= new AudioContext();
    }, { signal: this.listenerAbort.signal });
    window.addEventListener('keyup', (event) => { const key = keyMap[event.key.toLowerCase()]; if (key) { this.keys.delete(key); if (key === ' ') this.setJump(false); } }, { signal: this.listenerAbort.signal });
    this.canvas.addEventListener('click', this.handleCanvasClick, { signal: this.listenerAbort.signal });
    window.addEventListener('blur', () => this.resetInput(), { signal: this.listenerAbort.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetInput(); }, { signal: this.listenerAbort.signal });
  }

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    const bounds = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
    const target = new THREE.Vector3(); const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -corridorFloorY);
    if (!raycaster.ray.intersectPlane(floor, target)) return;
    if (target.x < -corridorWidth / 2 || target.x > corridorWidth / 2 || target.z > corridorStartZ || target.z < corridorEndZ) return;
    target.x = THREE.MathUtils.clamp(target.x, -corridorWidth / 2 + playerRadius, corridorWidth / 2 - playerRadius);
    target.z = THREE.MathUtils.clamp(target.z, corridorEndZ + playerRadius, corridorStartZ - playerRadius);
    target.y = corridorFloorY + playerRadius + 0.02;
    const path = this.navigation.findPath(this.player.pos.clone().setY(target.y), target);
    if (path.length) this.path = path;
  };

  private readonly frame = (now: number): void => {
    if (this.destroyed) return; const delta = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now; this.accumulator += delta;
    while (this.accumulator >= fixedStep) { this.update(); this.accumulator -= fixedStep; } this.render(delta); this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private update(): void {
    const direct = new THREE.Vector2(Number(this.keys.has('d')) - Number(this.keys.has('a')), Number(this.keys.has('s')) - Number(this.keys.has('w')));
    const touch = new THREE.Vector2(Number(this.touchKeys.has('right')) - Number(this.touchKeys.has('left')), Number(this.touchKeys.has('down')) - Number(this.touchKeys.has('up')));
    let input = direct;
    let automatic = false;
    if (!input.lengthSq() && !touch.lengthSq() && this.path.length) {
      const next = this.path[0]; const delta = next.position.clone().sub(this.player.pos); delta.y = 0;
      if (next.jump && this.player.grounded && !this.automaticJump) {
        this.player.vel.x = this.player.vel.z = 0;
        this.player.jumpBuffer = 8;
        this.automaticJump = true;
      }
      if (delta.length() < 4) {
        if (!next.jump || this.player.grounded) { this.path.shift(); this.automaticJump = false; }
        if (!this.path.length) this.player.vel.set(0, this.player.vel.y, 0);
      } else { input = new THREE.Vector2(delta.x, delta.z); automatic = true; }
    }
    const force = new THREE.Vector3();
    if (input.lengthSq() || touch.lengthSq()) {
      if (automatic) {
        const desired = new THREE.Vector3(input.x, 0, input.y).clampLength(0, 4.5);
        force.copy(desired).multiplyScalar(1 / CONFIG.friction).sub(new THREE.Vector3(this.player.vel.x, 0, this.player.vel.z)).clampLength(0, CONFIG.moveSpeed);
      } else {
        if (!this.wasMoving) this.movementCameraAngle = this.targetCameraAngle;
        const [x, z] = movementDirection(input.x, input.y, this.movementCameraAngle, this.orientation);
        const [tx, tz] = movementDirection(touch.x, touch.y, this.movementCameraAngle, 2);
        force.set(x + tx, 0, z + tz).normalize().multiplyScalar(CONFIG.moveSpeed);
      }
    }
    if (!this.physics.step(this.player, force) || this.player.pos.y < this.checkpoint.y - 300) this.resetPlayer();
    this.wasMoving = input.lengthSq() > 0 || touch.lengthSq() > 0; this.localAvatar.position.copy(this.player.pos);
    for (const remote of this.remoteAvatars.values()) remote.object.position.lerp(new THREE.Vector3(remote.target.x, remote.target.y, remote.target.z), 0.22);
    this.resolveAvatarOverlap(); this.checkDestinations();
    this.presence.publish({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, vx: this.player.vel.x, vy: this.player.vel.y, vz: this.player.vel.z });
  }

  private resolveAvatarOverlap(): void {
    for (const remote of this.remoteAvatars.values()) {
      const delta = this.player.pos.clone().sub(remote.object.position); const distance = delta.length();
      if (distance < playerRadius * 2) {
        if (distance === 0) delta.set(1, 0, 0); else delta.divideScalar(distance);
        const candidate = remote.object.position.clone().addScaledVector(delta, playerRadius * 2);
        if (candidate.x >= -80 && candidate.x <= 80 && candidate.z >= corridorEndZ + 20 && candidate.z <= corridorStartZ - 20) {
          this.player.pos.copy(candidate);
          if (this.player.vel.dot(delta) < 0) this.player.vel.addScaledVector(delta, -this.player.vel.dot(delta));
        }
      }
    }
    this.localAvatar.position.copy(this.player.pos);
  }

  private atDestination(position: THREE.Vector3): boolean {
    return this.player.grounded && Math.abs(this.player.pos.y - position.y) < 4 && Math.hypot(this.player.pos.x - position.x, this.player.pos.z - position.z) < 24;
  }

  private checkDestinations(): void {
    if (this.routePending) return;
    checkpointPositions.forEach((position, index) => {
      if (index > this.checkpointIndex && this.atDestination(position)) {
        this.checkpoint.copy(position); this.checkpointIndex = index;
        this.checkpoints.forEach((marker, markerIndex) => marker.setActive(markerIndex === index));
        this.showFeedback('CHECKPOINT', 0.6); this.playCheckpointSound();
      }
    });
    for (const door of doors) {
      if (this.atDestination(doorPosition(door))) {
        this.routePending = true;
        this.onRoute(door.path);
        return;
      }
    }
  }

  private setJump(pressed: boolean): void { this.player.jump(pressed, this.jumpPressed); this.jumpPressed = pressed; }
  private resetInput(): void { this.keys.clear(); this.touchKeys.clear(); this.mobile?.reset(); this.jumpPressed = this.wasMoving = this.automaticJump = false; this.player.jumpBuffer = 0; this.path = []; }
  private resetPlayer(): void { this.player.place(this.checkpoint); this.resetInput(); }
  private showFeedback(text: string, duration: number): void { this.feedback.textContent = text; this.feedbackRemaining = duration; }
  private playCheckpointSound(): void {
    this.audio ??= new AudioContext();
    const buffer = this.audio.createBuffer(1, Math.floor(this.audio.sampleRate * 0.12), this.audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const time = index / this.audio.sampleRate;
      samples[index] = Math.sin(Math.PI * 2 * (660 + 330 * time / 0.12) * time) * Math.exp(-24 * time) * 0.12;
    }
    const source = this.audio.createBufferSource(); source.buffer = buffer; source.connect(this.audio.destination); source.start();
  }

  private render(delta: number): void {
    this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.targetCameraAngle, 18, delta);
    this.camera.position.set(this.player.pos.x + Math.sin(this.cameraAngle) * VIEWPORT.cameraDistance, this.player.pos.y + VIEWPORT.cameraHeight, this.player.pos.z + Math.cos(this.cameraAngle) * VIEWPORT.cameraDistance);
    this.camera.lookAt(this.player.pos); this.localAvatar.quaternion.copy(this.camera.quaternion); for (const remote of this.remoteAvatars.values()) remote.object.quaternion.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true);
    this.contactMarker.visible = this.player.grounded;
    this.contactMarker.position.copy(this.physics.contactPosition).add(new THREE.Vector3(0, 6, 0));
    this.feedbackRemaining = Math.max(0, this.feedbackRemaining - delta);
    this.feedback.hidden = this.feedbackRemaining === 0;
    for (const [index, group] of this.doorObjects.entries()) {
      const projected = group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 126, 0)).project(this.camera);
      const link = this.doorLinks.children[index] as HTMLAnchorElement;
      link.hidden = Math.abs(projected.x) > 0.94 || Math.abs(projected.y) > 0.88;
      link.style.left = `${(projected.x + 1) * this.root.clientWidth / 2}px`;
      link.style.top = `${(1 - projected.y) * this.root.clientHeight / 2}px`;
    }
    const viewportHeight = this.root.clientHeight * window.devicePixelRatio;
    for (const checkpoint of this.checkpoints) checkpoint.update(this.camera, [this.localAvatar, ...[...this.remoteAvatars.values()].map((remote) => remote.object)], delta, viewportHeight);
    this.rendering.render(this.scene, this.camera);
    this.controlPreview.update(this.camera, this.targetCameraAngle, delta, this.root.clientHeight);
  }

  private receiveAvatars(avatars: Map<string, AvatarState>): void {
    for (const [id, avatar] of avatars) { let remote = this.remoteAvatars.get(id); if (!remote) { remote = { target: avatar, object: this.visualBuilder.createPlayerMesh() }; remote.object.position.set(avatar.x, avatar.y, avatar.z); this.remoteAvatars.set(id, remote); this.scene.add(remote.object); } else remote.target = avatar; }
    for (const [id, remote] of this.remoteAvatars) if (!avatars.has(id)) { this.scene.remove(remote.object); this.remoteAvatars.delete(id); }
  }
}
