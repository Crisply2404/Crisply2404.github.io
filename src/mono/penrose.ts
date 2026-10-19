import * as THREE from 'three';
import { penroseCycleHeight, penroseStepRise, penroseSteps, type PenroseStep } from '../penrose-config';
import { CONFIG, PHYSICS } from './config';
import type { PlayerState } from './physics';

export class PenroseLoop {
  public readonly cycleHeight = penroseCycleHeight;
  public cycle = 0;

  public constructor(private readonly steps: readonly PenroseStep[] = penroseSteps) {
    if (steps.length < 4) throw new Error('Penrose loop needs at least four steps');
  }

  public get renderOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, this.cycle * this.cycleHeight, 0);
  }

  public reset(): void { this.cycle = 0; }

  public wrapIfNeeded(player: PlayerState, movement: THREE.Vector3): boolean {
    const ascending = this.transition(player, movement, this.steps.length - 1, 0, 1);
    if (ascending) return true;
    return this.transition(player, movement, 0, this.steps.length - 1, -1);
  }

  public renderPosition(position: THREE.Vector3): THREE.Vector3 {
    return position.clone().add(this.renderOffset);
  }

  private transition(player: PlayerState, movement: THREE.Vector3, fromIndex: number, toIndex: number, direction: 1 | -1): boolean {
    const position = player.pos;
    const from = this.steps[fromIndex];
    const to = this.steps[toIndex];
    const center = new THREE.Vector3(from.gx * CONFIG.blockSize, from.gy * penroseStepRise + CONFIG.playerRadius + 20.02,
      from.gz * CONFIG.blockSize);
    const target = new THREE.Vector3(to.gx * CONFIG.blockSize, to.gy * penroseStepRise + CONFIG.playerRadius + 20.02,
      to.gz * CONFIG.blockSize);
    const horizontal = new THREE.Vector3(position.x - center.x, 0, position.z - center.z);
    const stepDirection = target.clone().sub(center).setY(0).normalize();
    if (horizontal.length() > CONFIG.playerRadius + CONFIG.moveSpeed * 2 || movement.dot(stepDirection) <= 0.01
      || Math.abs(position.y - center.y) > 1.5 || !player.grounded) return false;
    position.set(to.gx * CONFIG.blockSize, to.gy * penroseStepRise + CONFIG.playerRadius + 20.02,
      to.gz * CONFIG.blockSize);
    player.vel.y = 0;
    player.grounded = true;
    player.coyoteTime = PHYSICS.coyoteFrames;
    this.cycle += direction;
    return true;
  }
}
