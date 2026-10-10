import * as THREE from 'three';
import { PresenceClient } from './presence';
import { corridorBlocks, corridorEndZ, corridorStartZ, doors, doorPosition, fixedStep, playerRadius, spawn } from './sceneConfig';
import type { AvatarState, DoorConfig } from './types';
import { CONFIG, VIEWPORT, controlModeOrder, movementDirection, type WasdOrientation } from './mono/config';
import { VisualBuilder } from './mono/objects';
import { doorGraphics } from './mono/door-graphics';
import { MonoRenderer } from './mono/renderer';
import { PhysicsEngine, PlayerState, physicsReady } from './mono/physics';
import { SafetyNavigationGraph, navigationForce } from './mono/navigation';
import { MobileControls } from './mono/mobile';
import { ControlPreview } from './mono/control-preview';
import { ControlTutorial } from './mono/control-tutorial';
import { NavigationRipple } from './mono/navigation-ripple';
import { CanvasNavigation, type ViewGesture } from './mono/canvas-navigation';

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
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly keys = new Set<KeyName>();
  private readonly listenerAbort = new AbortController();
  private readonly presence: PresenceClient;
  private readonly blocks = corridorBlocks();
  private readonly navigation = new SafetyNavigationGraph(this.blocks);
  private readonly physics = new PhysicsEngine(this.blocks);
  private readonly player = new PlayerState();
  private readonly ripple = new NavigationRipple(this.blocks);
  private floorObjects!: THREE.Group;
  private readonly mobile: MobileControls;
  private readonly controlPreview: ControlPreview;
  private readonly controlTutorial: ControlTutorial;
  private readonly canvasNavigation: CanvasNavigation;
  private readonly viewOffset = new THREE.Vector3();
  private readonly touchView = matchMedia('(pointer: coarse)').matches;
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
  private orientation: WasdOrientation = 2;
  private path: { position: THREE.Vector3; jump: boolean }[] = [];
  private destroyed = false;

  public constructor(root: HTMLElement, onRoute: (path: string) => void) {
    this.root = root; this.onRoute = onRoute;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'scene-canvas'; this.root.append(this.canvas);
    this.rendering = new MonoRenderer(this.canvas); this.visualBuilder = new VisualBuilder(this.rendering);
    this.localAvatar = this.visualBuilder.createPlayerMesh();
    this.camera.zoom = this.touchView ? 1.5 : 1;
    this.controlPreview = new ControlPreview(root);
    this.controlTutorial = new ControlTutorial(root);
    this.buildScene(); this.installInput();
    this.canvasNavigation = new CanvasNavigation(this.canvas, this.navigateToPoint, this.applyViewGesture);
    this.presence = new PresenceClient(import.meta.env.VITE_PRESENCE_WS_URL as string | undefined, (avatars) => this.receiveAvatars(avatars));
    this.mobile = new MobileControls(root, (action, pressed) => {
      if (action === 'rotateLeft' && pressed) this.targetCameraAngle += Math.PI / 2;
      else if (action === 'rotateRight' && pressed) this.targetCameraAngle -= Math.PI / 2;
      else if (action === 'jump') this.setJump(pressed);
    });
    this.resize(); window.addEventListener('resize', this.resize, { signal: this.listenerAbort.signal });
    void Promise.all([physicsReady, this.visualBuilder.ready()]).then(() => {
      if (!this.destroyed) this.animationFrame = window.requestAnimationFrame(this.frame);
    });
  }

  public destroy(): void {
    this.destroyed = true; this.listenerAbort.abort(); this.presence.destroy(); window.cancelAnimationFrame(this.animationFrame);
    this.mobile.dispose(); this.canvasNavigation.dispose(); this.controlPreview.dispose(); this.controlTutorial.dispose(); this.physics.dispose();
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
    this.floorObjects = this.visualBuilder.createLevelMesh(this.blocks);
    this.scene.add(this.floorObjects, this.ripple);
    for (const door of doors) this.addDoor(door);
    const exit = this.visualBuilder.createSiteGate(new THREE.Vector3(0, 40.02, corridorEndZ + 20));
    exit.rotation.y = 0;
    exit.name = 'CorridorExit';
    this.scene.add(exit);
    this.localAvatar.position.copy(spawn); this.scene.add(this.localAvatar);
    this.player.place(spawn);
  }

  private addDoor(door: DoorConfig): void {
    const position = doorPosition(door);
    const group = this.visualBuilder.createSiteGate(position, Math.PI / 2, doorGraphics[door.graphics]);
    group.userData.door = door;
    this.scene.add(group);
  }

  private installInput(): void {
    const keyMap: Record<string, KeyName | undefined> = { w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', arrowleft: 'q', arrowright: 'e', r: 'r', ' ': ' ' };
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (event.key === 'Tab') {
        event.preventDefault(); this.orientation = controlModeOrder[(controlModeOrder.indexOf(this.orientation) + 1) % controlModeOrder.length];
        this.resetInput(); this.controlPreview.show(this.orientation); return;
      }
      const key = keyMap[event.key.toLowerCase()]; if (!key) return; event.preventDefault();
      if (key === 'q') this.targetCameraAngle += Math.PI / 2; else if (key === 'e') this.targetCameraAngle -= Math.PI / 2; else if (key === 'r') this.resetPlayer(); else this.keys.add(key);
      if (key === ' ') this.setJump(true);
      if (['w', 'a', 's', 'd'].includes(key)) this.path = [];
    }, { signal: this.listenerAbort.signal });
    window.addEventListener('keyup', (event) => { const key = keyMap[event.key.toLowerCase()]; if (key) { this.keys.delete(key); if (key === ' ') this.setJump(false); } }, { signal: this.listenerAbort.signal });
    window.addEventListener('blur', () => this.resetInput(), { signal: this.listenerAbort.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetInput(); }, { signal: this.listenerAbort.signal });
  }

  private screenRay(point: THREE.Vector2): THREE.Raycaster {
    const bounds = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((point.x - bounds.left) / bounds.width * 2 - 1, -((point.y - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
    return raycaster;
  }

  private readonly navigateToPoint = (point: THREE.Vector2): void => {
    const raycaster = this.screenRay(point);
    const hit = raycaster.intersectObject(this.floorObjects.getObjectByName('BlackBlocks')!, false)[0];
    if (!hit || !hit.face || hit.face.normal.y < 0.99) return;
    const target = hit.point.clone();
    target.y += playerRadius + 0.02;
    const path = this.navigation.findPath(this.player.pos.clone(), target);
    if (path.length) { this.path = path; this.ripple.show(hit.point); }
  };

  private readonly applyViewGesture = (gesture: ViewGesture): void => {
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.player.pos.y);
    const onGround = (point: THREE.Vector2): THREE.Vector3 => {
      const ray = this.screenRay(point).ray;
      return ray.at(-ground.distanceToPoint(ray.origin) / ground.normal.dot(ray.direction), new THREE.Vector3());
    };
    const before = onGround(gesture.previousCenter);
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * gesture.scale, 1, 3);
    this.camera.updateProjectionMatrix();
    const after = onGround(gesture.center);
    const shift = before.sub(after); this.viewOffset.add(shift); this.camera.position.add(shift);
    this.camera.updateMatrixWorld();
    this.keepPlayerVisible();
  };

  private keepPlayerVisible(): void {
    if (!this.touchView) return;
    const width = this.root.clientWidth, height = this.root.clientHeight;
    const halfWidth = (this.camera.right - this.camera.left) / (2 * this.camera.zoom);
    const halfHeight = (this.camera.top - this.camera.bottom) / (2 * this.camera.zoom);
    const radius = (playerRadius + CONFIG.thickness) * height / (2 * halfHeight);
    const horizontalMargin = Math.min(width / 2, radius + 24);
    const topMargin = Math.min(height / 2, radius + 76);
    const bottomMargin = Math.min(height / 2, radius + 88);
    const point = this.player.pos.clone().project(this.camera);
    const x = THREE.MathUtils.clamp(point.x, -1 + 2 * horizontalMargin / width, 1 - 2 * horizontalMargin / width);
    const y = THREE.MathUtils.clamp(point.y, -1 + 2 * bottomMargin / height, 1 - 2 * topMargin / height);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0);
    const shift = right.multiplyScalar((point.x - x) * halfWidth)
      .addScaledVector(up, (point.y - y) * halfHeight / up.lengthSq());
    this.viewOffset.add(shift); this.camera.position.add(shift); this.camera.updateMatrixWorld();
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return; const delta = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now; this.accumulator += delta;
    while (this.accumulator >= fixedStep) { this.update(); this.accumulator -= fixedStep; } this.render(delta); this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private update(): void {
    const direct = new THREE.Vector2(Number(this.keys.has('d')) - Number(this.keys.has('a')), Number(this.keys.has('s')) - Number(this.keys.has('w')));
    let input = direct;
    let automatic = false;
    if (!input.lengthSq() && this.path.length) {
      const next = this.path[0]; const delta = next.position.clone().sub(this.player.pos); delta.y = 0;
      if (next.jump && this.player.grounded && !this.automaticJump) {
        this.player.vel.x = this.player.vel.z = 0;
        this.player.jumpBuffer = 8;
        this.automaticJump = true;
      }
      if (delta.length() < 0.5) {
        if (!next.jump || this.player.grounded) { this.path.shift(); this.automaticJump = false; }
        if (!this.path.length) this.player.vel.set(0, this.player.vel.y, 0);
      } else { input = new THREE.Vector2(delta.x, delta.z); automatic = true; }
    }
    const force = new THREE.Vector3();
    if (input.lengthSq()) {
      if (automatic) {
        force.copy(navigationForce(this.player.pos, this.player.vel, this.path[0].position));
      } else {
        if (!this.wasMoving) this.movementCameraAngle = this.targetCameraAngle;
        const [x, z] = movementDirection(input.x, input.y, this.movementCameraAngle, this.orientation);
        force.set(x, 0, z).normalize().multiplyScalar(CONFIG.moveSpeed);
      }
    }
    if (!this.physics.step(this.player, force) || this.player.pos.y < spawn.y - 300) this.resetPlayer();
    this.wasMoving = input.lengthSq() > 0; this.localAvatar.position.copy(this.player.pos);
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
    for (const door of doors) {
      if (this.atDestination(doorPosition(door))) {
        this.routePending = true;
        this.onRoute(door.path);
        return;
      }
    }
  }

  private setJump(pressed: boolean): void { this.player.jump(pressed, this.jumpPressed); this.jumpPressed = pressed; }
  private resetInput(): void { this.keys.clear(); this.mobile?.reset(); this.canvasNavigation?.reset(); this.jumpPressed = this.wasMoving = this.automaticJump = false; this.player.jumpBuffer = 0; this.path = []; }
  private resetPlayer(): void { this.player.place(spawn); this.resetInput(); }

  private render(delta: number): void {
    this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.targetCameraAngle, 18, delta);
    const center = this.player.pos.clone().add(this.viewOffset);
    this.camera.position.set(center.x + Math.sin(this.cameraAngle) * VIEWPORT.cameraDistance, center.y + VIEWPORT.cameraHeight, center.z + Math.cos(this.cameraAngle) * VIEWPORT.cameraDistance);
    this.camera.lookAt(center); this.localAvatar.quaternion.copy(this.camera.quaternion); for (const remote of this.remoteAvatars.values()) remote.object.quaternion.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    this.keepPlayerVisible();
    this.ripple.update(delta); this.scene.updateMatrixWorld(true);
    this.rendering.render(this.scene, this.camera);
    this.controlPreview.update(this.camera, this.targetCameraAngle, delta, this.root.clientHeight);
    this.controlTutorial.update(delta);
  }

  private receiveAvatars(avatars: Map<string, AvatarState>): void {
    for (const [id, avatar] of avatars) { let remote = this.remoteAvatars.get(id); if (!remote) { remote = { target: avatar, object: this.visualBuilder.createPlayerMesh() }; remote.object.position.set(avatar.x, avatar.y, avatar.z); this.remoteAvatars.set(id, remote); this.scene.add(remote.object); } else remote.target = avatar; }
    for (const [id, remote] of this.remoteAvatars) if (!avatars.has(id)) { this.scene.remove(remote.object); this.remoteAvatars.delete(id); }
  }
}
