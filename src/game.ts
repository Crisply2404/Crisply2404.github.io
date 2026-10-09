import * as THREE from 'three';
import { PresenceClient } from './presence';
import {
  blockSize,
  corridorEndZ,
  corridorFloorY,
  corridorStartZ,
  corridorWidth,
  createNavigationNodes,
  doors,
  fixedStep,
  playerRadius,
} from './sceneConfig';
import type { AvatarState, DoorConfig, NavigationNode } from './types';

const gravity = 0.65;
const jumpForce = 10;
const moveSpeed = 1.2;
const friction = 0.82;
const maxSpeed = 10;
const cameraDistance = 800;
const cameraHeight = 640;
const viewHeight = 800;

type KeyName = 'w' | 'a' | 's' | 'd' | 'q' | 'e' | 'r' | ' ';

interface Point {
  x: number;
  z: number;
}

interface RemoteAvatar {
  target: AvatarState;
  object: THREE.Group;
}

function createWireBox(size: THREE.Vector3, color = 0xffffff): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  group.add(body, edges);
  return group;
}

function createAvatar(): THREE.Group {
  const avatar = new THREE.Group();
  const whiteSphere = new THREE.Mesh(
    new THREE.SphereGeometry(playerRadius, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const blackCore = new THREE.Mesh(
    new THREE.SphereGeometry(playerRadius * 0.76, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  avatar.add(whiteSphere, blackCore);
  return avatar;
}

function createLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.font = '36px Courier New';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(88, 16.5, 1);
  return sprite;
}

function distanceSquared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export class GameScene {
  private readonly root: HTMLElement;
  private readonly onRoute: (path: string) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly localAvatar = createAvatar();
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly keys = new Set<KeyName>();
  private readonly navigationNodes = createNavigationNodes();
  private readonly nodeLookup = new Map(this.navigationNodes.map((node) => [node.id, node]));
  private readonly doorMeshes: THREE.Object3D[] = [];
  private readonly presence: PresenceClient;
  private readonly listenerAbort = new AbortController();
  private animationFrame = 0;
  private previousTime = performance.now();
  private accumulator = 0;
  private player = { x: 0, y: 0, z: 70, vx: 0, vy: 0, vz: 0 };
  private targetCameraYaw = Math.PI / 4;
  private cameraYaw = Math.PI / 4;
  private movementCameraYaw = Math.PI / 4;
  private jumpQueued = false;
  private path: Point[] = [];
  private destroyed = false;

  public constructor(root: HTMLElement, onRoute: (path: string) => void) {
    this.root = root;
    this.onRoute = onRoute;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scene-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.root.append(this.canvas);
    this.buildScene();
    this.installInput();
    const presenceUrl = import.meta.env.VITE_PRESENCE_WS_URL as string | undefined;
    this.presence = new PresenceClient(presenceUrl, (avatars) => this.receiveAvatars(avatars));
    this.installMobileControls();
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.listenerAbort.signal });
    this.animationFrame = window.requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    this.destroyed = true;
    this.listenerAbort.abort();
    this.presence.destroy();
    window.cancelAnimationFrame(this.animationFrame);
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  private readonly resize = (): void => {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const aspect = width / Math.max(height, 1);
    const halfHeight = viewHeight / 2;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private buildScene(): void {
    const corridorLength = corridorStartZ - corridorEndZ;
    const floor = createWireBox(new THREE.Vector3(corridorWidth, 4, corridorLength));
    floor.position.set(0, corridorFloorY - 2, (corridorStartZ + corridorEndZ) / 2);
    this.scene.add(floor);

    const ceiling = createWireBox(new THREE.Vector3(corridorWidth, 2, corridorLength), 0x808080);
    ceiling.position.set(0, 160, (corridorStartZ + corridorEndZ) / 2);
    this.scene.add(ceiling);

    for (const door of doors) {
      this.addDoor(door);
    }

    this.localAvatar.position.set(this.player.x, this.player.y + playerRadius, this.player.z);
    this.scene.add(this.localAvatar);
  }

  private addDoor(door: DoorConfig): void {
    const sideSign = door.side === 'left' ? -1 : 1;
    const frame = new THREE.Group();
    const frameX = sideSign * (corridorWidth / 2 + 4);
    frame.position.set(frameX, 0, door.z);
    const vertical = new THREE.Mesh(
      new THREE.BoxGeometry(4, 96, 4),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(64, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    const left = vertical.clone();
    const right = vertical.clone();
    left.position.x = -32;
    right.position.x = 32;
    horizontal.position.y = 48;
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(64, 96, 4)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    frame.add(left, right, horizontal, lines);
    frame.userData.door = door;
    this.scene.add(frame);
    this.doorMeshes.push(frame);

    const label = createLabel(door.title);
    label.position.set(frameX - sideSign * 10, 118, door.z);
    this.scene.add(label);
  }

  private installInput(): void {
    const keyMap: Record<string, KeyName | undefined> = {
      w: 'w',
      a: 'a',
      s: 's',
      d: 'd',
      q: 'q',
      e: 'e',
      arrowleft: 'q',
      arrowright: 'e',
      r: 'r',
      ' ': ' ',
    };
    window.addEventListener(
      'keydown',
      (event) => {
        const key = keyMap[event.key.toLowerCase()];
        if (!key) return;
        event.preventDefault();
        this.keys.add(key);
        if (key === ' ') this.jumpQueued = true;
        if (key === 'q') this.targetCameraYaw += Math.PI / 2;
        if (key === 'e') this.targetCameraYaw -= Math.PI / 2;
        if (key === 'r') this.resetPlayer();
      },
      { signal: this.listenerAbort.signal },
    );
    window.addEventListener(
      'keyup',
      (event) => {
        const key = keyMap[event.key.toLowerCase()];
        if (key) this.keys.delete(key);
      },
      { signal: this.listenerAbort.signal },
    );
    this.canvas.addEventListener('pointerup', this.handlePointerUp, { signal: this.listenerAbort.signal });
    this.canvas.addEventListener('click', this.handleCanvasClick, { signal: this.listenerAbort.signal });
  }

  private readonly handlePointerUp = (): void => {
    this.path = [];
  };

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    const bounds = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const doorHit = raycaster
      .intersectObjects(this.doorMeshes, true)
      .find((hit) => Boolean(hit.object.parent?.userData.door));
    if (doorHit) {
      const door = doorHit.object.parent?.userData.door as DoorConfig | undefined;
      if (door) window.open(door.path, '_blank', 'noopener');
      return;
    }

    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -corridorFloorY);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, point)) return;
    const target = { x: point.x, z: point.z };
    if (target.x < -corridorWidth / 2 + playerRadius || target.x > corridorWidth / 2 - playerRadius) return;
    if (target.z > corridorStartZ || target.z < corridorEndZ) return;
    this.path = this.findPath({ x: this.player.x, z: this.player.z }, target);
  };

  private installMobileControls(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'mobile-controls';
    wrapper.innerHTML = `
      <div class="dpad" aria-label="Movement">
        <button class="touch-button" data-key="w" aria-label="Move forward">↑</button>
        <button class="touch-button" data-key="a" aria-label="Move left">←</button>
        <button class="touch-button" data-key="d" aria-label="Move right">→</button>
        <button class="touch-button" data-key="s" aria-label="Move backward">↓</button>
      </div>
      <div class="action-pad">
        <button class="touch-button" data-key="q" aria-label="Rotate left">↶</button>
        <button class="touch-button" data-key=" " aria-label="Jump">↑</button>
        <button class="touch-button" data-key="e" aria-label="Rotate right">↷</button>
      </div>
    `;
    this.root.append(wrapper);
    for (const button of wrapper.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      const key = button.dataset.key as KeyName;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.keys.add(key);
        if (key === ' ') this.jumpQueued = true;
        if (key === 'q') this.targetCameraYaw += Math.PI / 2;
        if (key === 'e') this.targetCameraYaw -= Math.PI / 2;
      });
      const release = (): void => {
        this.keys.delete(key);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    }
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const delta = Math.min((now - this.previousTime) / 1000, 0.1);
    this.previousTime = now;
    this.accumulator += delta;
    while (this.accumulator >= fixedStep) {
      this.update(fixedStep);
      this.accumulator -= fixedStep;
    }
    this.render();
    this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private update(delta: number): void {
    this.updateLocalPlayer(delta);
    this.updateRemoteAvatars(delta);
    this.resolveAvatarOverlap();
    this.checkDoorEntry();
    this.presence.publish({
      x: this.player.x,
      y: this.player.y,
      z: this.player.z,
      vx: this.player.vx,
      vy: this.player.vy,
      vz: this.player.vz,
    });
  }

  private updateLocalPlayer(delta: number): void {
    const direct = new THREE.Vector2(
      Number(this.keys.has('d')) - Number(this.keys.has('a')),
      Number(this.keys.has('s')) - Number(this.keys.has('w')),
    );
    let input = direct;
    if (input.lengthSq() === 0 && this.path.length > 0) {
      const next = this.path[0];
      const toNext = new THREE.Vector2(next.x - this.player.x, next.z - this.player.z);
      if (toNext.length() < 8) {
        this.path.shift();
      } else {
        input = toNext.normalize();
      }
    }

    if (input.lengthSq() > 0) {
      input = input.normalize();
      if (direct.lengthSq() > 0) this.movementCameraYaw = this.cameraYaw;
      const worldX = input.x * Math.cos(this.movementCameraYaw) - input.y * Math.sin(this.movementCameraYaw);
      const worldZ = input.x * Math.sin(this.movementCameraYaw) + input.y * Math.cos(this.movementCameraYaw);
      this.player.vx += worldX * moveSpeed;
      this.player.vz += worldZ * moveSpeed;
    } else {
      this.player.vx *= friction;
      this.player.vz *= friction;
    }

    const horizontalSpeed = Math.hypot(this.player.vx, this.player.vz);
    if (horizontalSpeed > maxSpeed) {
      const ratio = maxSpeed / horizontalSpeed;
      this.player.vx *= ratio;
      this.player.vz *= ratio;
    }

    if (this.jumpQueued && this.player.y <= corridorFloorY + 0.1) {
      this.player.vy = jumpForce;
    }
    this.jumpQueued = false;
    this.player.vy -= gravity;
    this.player.x += this.player.vx * delta;
    this.player.z += this.player.vz * delta;
    this.player.y += this.player.vy * delta;
    if (this.player.y < corridorFloorY) {
      this.player.y = corridorFloorY;
      this.player.vy = 0;
    }

    this.player.x = THREE.MathUtils.clamp(this.player.x, -corridorWidth / 2 + playerRadius, corridorWidth / 2 - playerRadius);
    this.player.z = THREE.MathUtils.clamp(this.player.z, corridorEndZ + playerRadius, corridorStartZ - playerRadius);
    this.localAvatar.position.set(this.player.x, this.player.y + playerRadius, this.player.z);
  }

  private updateRemoteAvatars(delta: number): void {
    for (const remote of this.remoteAvatars.values()) {
      remote.object.position.x = THREE.MathUtils.damp(remote.object.position.x, remote.target.x, 14, delta);
      remote.object.position.y = THREE.MathUtils.damp(remote.object.position.y, remote.target.y + playerRadius, 14, delta);
      remote.object.position.z = THREE.MathUtils.damp(remote.object.position.z, remote.target.z, 14, delta);
    }
  }

  private resolveAvatarOverlap(): void {
    const localPoint = { x: this.player.x, z: this.player.z };
    for (const remote of this.remoteAvatars.values()) {
      const remotePoint = { x: remote.object.position.x, z: remote.object.position.z };
      const distance = Math.sqrt(distanceSquared(localPoint, remotePoint));
      if (distance >= playerRadius * 2 || distance === 0) continue;
      const normalX = (localPoint.x - remotePoint.x) / distance;
      const normalZ = (localPoint.z - remotePoint.z) / distance;
      const correction = (playerRadius * 2 - distance) / 2;
      this.player.x = THREE.MathUtils.clamp(this.player.x + normalX * correction, -corridorWidth / 2 + playerRadius, corridorWidth / 2 - playerRadius);
      this.player.z = THREE.MathUtils.clamp(this.player.z + normalZ * correction, corridorEndZ + playerRadius, corridorStartZ - playerRadius);
      remote.object.position.x -= normalX * correction;
      remote.object.position.z -= normalZ * correction;
    }
    this.localAvatar.position.set(this.player.x, this.player.y + playerRadius, this.player.z);
  }

  private checkDoorEntry(): void {
    for (const door of doors) {
      const doorX = door.side === 'left' ? -corridorWidth / 2 : corridorWidth / 2;
      if (Math.abs(this.player.z - door.z) < 28 && Math.abs(this.player.x - doorX) < 48) {
        this.onRoute(door.path);
        return;
      }
    }
  }

  private render(): void {
    this.cameraYaw = THREE.MathUtils.damp(this.cameraYaw, this.targetCameraYaw, 18, fixedStep);
    this.camera.position.set(
      Math.sin(this.cameraYaw) * cameraDistance,
      cameraHeight,
      this.player.z + Math.cos(this.cameraYaw) * cameraDistance,
    );
    this.camera.lookAt(0, 0, this.player.z);
    this.renderer.render(this.scene, this.camera);
  }

  private receiveAvatars(avatars: Map<string, AvatarState>): void {
    for (const [id, avatar] of avatars) {
      let remote = this.remoteAvatars.get(id);
      if (!remote) {
        remote = { target: avatar, object: createAvatar() };
        remote.object.position.set(avatar.x, avatar.y + playerRadius, avatar.z);
        this.remoteAvatars.set(id, remote);
        this.scene.add(remote.object);
      } else {
        remote.target = avatar;
      }
    }
    for (const [id, remote] of this.remoteAvatars) {
      if (!avatars.has(id)) {
        this.scene.remove(remote.object);
        this.remoteAvatars.delete(id);
      }
    }
  }

  private resetPlayer(): void {
    this.player = { x: 0, y: 0, z: 70, vx: 0, vy: 0, vz: 0 };
    this.path = [];
  }

  private findPath(start: Point, target: Point): Point[] {
    const startNode = this.nearestNode(start);
    const targetNode = this.nearestNode(target);
    const open = new Set<string>([startNode.id]);
    const cameFrom = new Map<string, string>();
    const cost = new Map<string, number>([[startNode.id, 0]]);
    const score = new Map<string, number>([[startNode.id, distanceSquared(startNode, targetNode)]]);

    while (open.size > 0) {
      const currentId = [...open].sort((a, b) => (score.get(a) ?? Infinity) - (score.get(b) ?? Infinity))[0];
      if (currentId === targetNode.id) {
        const result: Point[] = [target];
        let cursor = currentId;
        while (cameFrom.has(cursor)) {
          const node = this.nodeLookup.get(cursor);
          if (node) result.unshift({ x: node.x, z: node.z });
          cursor = cameFrom.get(cursor) as string;
        }
        return result;
      }
      open.delete(currentId);
      const current = this.nodeLookup.get(currentId);
      if (!current) continue;
      for (const neighbor of this.neighbors(current)) {
        if (neighbor.blocked) continue;
        const tentative = (cost.get(currentId) ?? Infinity) + distanceSquared(current, neighbor);
        if (tentative < (cost.get(neighbor.id) ?? Infinity)) {
          cameFrom.set(neighbor.id, currentId);
          cost.set(neighbor.id, tentative);
          score.set(neighbor.id, tentative + distanceSquared(neighbor, targetNode));
          open.add(neighbor.id);
        }
      }
    }

    return [];
  }

  private nearestNode(point: Point): NavigationNode {
    return this.navigationNodes.reduce((nearest, candidate) =>
      distanceSquared(candidate, point) < distanceSquared(nearest, point) ? candidate : nearest,
    );
  }

  private neighbors(node: NavigationNode): NavigationNode[] {
    return this.navigationNodes.filter(
      (candidate) =>
        (candidate.x === node.x && Math.abs(candidate.z - node.z) === blockSize) ||
        (candidate.z === node.z && Math.abs(candidate.x - node.x) === 30),
    );
  }
}
