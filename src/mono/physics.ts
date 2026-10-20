import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG, PHYSICS } from './config';
import { blockCenterY, blockHeight, type BlockData } from './blocks';

export const physicsReady = RAPIER.init();

export class PlayerState {
  public readonly pos = new THREE.Vector3();
  public readonly vel = new THREE.Vector3();
  public grounded = false;
  public coyoteTime = 0;
  public jumpBuffer = 0;

  public place(position: THREE.Vector3): void {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.coyoteTime = this.jumpBuffer = 0;
  }

  public jump(pressed: boolean, previous: boolean): void {
    if (pressed && !previous) this.jumpBuffer = PHYSICS.jumpBufferFrames;
    if (!pressed && previous && this.vel.y > 0) this.vel.y *= PHYSICS.jumpCutMultiplier;
  }

  public consumeJump(): void {
    if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTime > 0)) {
      this.vel.y = CONFIG.jumpForce;
      this.grounded = false;
      this.coyoteTime = this.jumpBuffer = 0;
    }
  }
}

export class PhysicsEngine {
  public readonly contactPosition = new THREE.Vector3();
  private readonly world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  private readonly sphere = new RAPIER.Ball(CONFIG.playerRadius);
  private readonly hazards = new Set<number>();
  private readonly rotation = { x: 0, y: 0, z: 0, w: 1 };

  public constructor(blocks: readonly BlockData[], hulls: readonly Float32Array[] = []) {
    for (const vertices of hulls) {
      const descriptor = RAPIER.ColliderDesc.convexHull(vertices);
      if (!descriptor) throw new Error('Surface hull is invalid');
      this.world.createCollider(descriptor);
    }
    for (const block of blocks) {
      if (block.type === 'standard' && blockHeight(block) <= 0) throw new Error('Platform height must be positive');
      let descriptor: RAPIER.ColliderDesc;
      if (block.type === 'spike') {
        const hull = RAPIER.ColliderDesc.convexHull(new Float32Array([-20, -20, -20, 20, -20, -20, -20, -20, 20, 20, -20, 20, 0, 20, 0]));
        if (!hull) throw new Error('Spike hull is invalid');
        descriptor = hull;
      } else descriptor = RAPIER.ColliderDesc.cuboid(20 - PHYSICS.sideContactTolerance,
        blockHeight(block) / 2, 20 - PHYSICS.sideContactTolerance);
      descriptor.setTranslation(block.gx * 40, blockCenterY(block), block.gz * 40);
      const collider = this.world.createCollider(descriptor);
      if (block.type === 'spike') this.hazards.add(collider.handle);
    }
    this.world.step();
  }

  public step(player: PlayerState, force: THREE.Vector3): boolean {
    player.consumeJump();
    player.vel.add(force);
    player.vel.x *= CONFIG.friction;
    player.vel.z *= CONFIG.friction;
    player.vel.y -= CONFIG.gravity;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (speed > CONFIG.maxSpeed) {
      player.vel.x *= CONFIG.maxSpeed / speed;
      player.vel.z *= CONFIG.maxSpeed / speed;
    }
    if (!this.movePlayer(player)) return false;
    player.consumeJump();
    if (player.jumpBuffer > 0) player.jumpBuffer -= 1;
    return true;
  }

  public dispose(): void { this.world.free(); }

  private movePlayer(player: PlayerState): boolean {
    const motion = player.vel.clone();
    let grounded = false;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      if (motion.lengthSq() < 0.000001) break;
      const hit = this.world.castShape(player.pos, this.rotation, motion, this.sphere, PHYSICS.safeMargin, 1, false);
      if (!hit) {
        player.pos.add(motion);
        break;
      }
      if (this.hazards.has(hit.collider.handle)) return false;
      player.pos.addScaledVector(motion, hit.time_of_impact);
      const normal = new THREE.Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z).normalize();
      // 恢复球体与表面的接触距离，保持沿表面的连续移动。
      if (hit.time_of_impact === 0) {
        const contact = hit.collider.contactShape(this.sphere, player.pos, this.rotation, PHYSICS.safeMargin);
        if (contact && contact.distance < PHYSICS.safeMargin) {
          normal.set(contact.normal1.x, contact.normal1.y, contact.normal1.z).normalize();
          player.pos.addScaledVector(normal, PHYSICS.safeMargin - contact.distance);
        }
      }
      if (normal.y > 0.7 && player.vel.y <= 0) {
        grounded = true;
        this.contactPosition.set(hit.witness1.x, hit.witness1.y, hit.witness1.z);
      }
      if (player.vel.dot(normal) < 0) player.vel.addScaledVector(normal, -player.vel.dot(normal));
      motion.multiplyScalar(1 - hit.time_of_impact);
      if (motion.dot(normal) < 0) motion.addScaledVector(normal, -motion.dot(normal));
    }
    if (!grounded && player.vel.y <= 0) {
      const ray = new RAPIER.Ray(player.pos, { x: 0, y: -1, z: 0 });
      const support = this.world.castRayAndGetNormal(ray, CONFIG.playerRadius + PHYSICS.safeMargin, true);
      if (support && support.normal.y > 0.999 && support.timeOfImpact > CONFIG.playerRadius - CONFIG.gravity - PHYSICS.safeMargin) {
        if (this.hazards.has(support.collider.handle)) return false;
        player.pos.y += CONFIG.playerRadius + PHYSICS.safeMargin - support.timeOfImpact;
        player.vel.y = 0; grounded = true;
        this.contactPosition.copy(player.pos).add(new THREE.Vector3(0, -CONFIG.playerRadius, 0));
      }
    }
    player.grounded = grounded;
    if (grounded) player.coyoteTime = PHYSICS.coyoteFrames;
    else if (player.coyoteTime > 0) player.coyoteTime -= 1;
    return true;
  }
}
