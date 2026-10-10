import * as THREE from 'three';
import { blockKey, type BlockData } from './blocks';
import { PhysicsEngine, PlayerState } from './physics';
import { CONFIG } from './config';

export interface NavigationPoint {
  position: THREE.Vector3;
  jump: boolean;
}

export interface JumpConnection {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

export class SafetyNavigationGraph {
  private readonly nodes = new Map<string, THREE.Vector3>();
  private readonly edges = new Map<string, { id: string; jump: boolean }[]>();
  private readonly surfaces: readonly BlockData[];

  public constructor(blocks: readonly BlockData[], jumps: readonly JumpConnection[] = []) {
    const occupied = new Map(blocks.map((block) => [blockKey(block.gx, block.gy, block.gz), block]));
    this.surfaces = blocks.filter((block) => block.type === 'standard' && !occupied.has(blockKey(block.gx, block.gy + 1, block.gz)));
    for (const block of this.surfaces) {
      if (occupied.has(blockKey(block.gx, block.gy + 1, block.gz))) continue;
      const position = new THREE.Vector3(block.gx * 40, block.gy * 40 + 40.02, block.gz * 40);
      this.nodes.set(position.toArray().join(':'), position);
    }
    for (const [id, position] of this.nodes) {
      const neighbors: { id: string; jump: boolean }[] = [];
      for (const [otherId, other] of this.nodes) {
        if (position.y === other.y && Math.abs(position.x - other.x) + Math.abs(position.z - other.z) === 40 && this.safeSegment(position, other)) {
          neighbors.push({ id: otherId, jump: false });
        }
      }
      this.edges.set(id, neighbors);
    }
    for (const connection of jumps) {
      const from = connection.from.toArray().join(':');
      const to = connection.to.toArray().join(':');
      if (!this.nodes.has(from) || !this.nodes.has(to) || !this.isSafe(connection.from) || !this.isSafe(connection.to)) {
        throw new Error('Jump connection requires safe endpoints');
      }
      const physics = new PhysicsEngine(blocks);
      const player = new PlayerState();
      player.place(connection.from);
      player.grounded = true;
      player.jumpBuffer = 8;
      let reached = false;
      for (let tick = 0; tick < 90; tick += 1) {
        const offset = connection.to.clone().sub(player.pos).setY(0);
        const desired = offset.clampLength(0, 4.5);
        const force = desired.multiplyScalar(1 / CONFIG.friction).sub(new THREE.Vector3(player.vel.x, 0, player.vel.z)).clampLength(0, CONFIG.moveSpeed);
        if (!physics.step(player, force)) break;
        if (player.grounded && player.pos.distanceTo(connection.to) < 4) {
          reached = true;
          break;
        }
        if (player.pos.y < connection.to.y - 100) break;
      }
      physics.dispose();
      if (!reached) throw new Error('Jump connection has no safe physical trajectory');
      this.edges.get(from)!.push({ id: to, jump: true });
    }
  }

  public isSafe(position: THREE.Vector3): boolean {
    for (const dx of [-20, 0, 20]) {
      for (const dz of [-20, 0, 20]) {
        const supported = this.surfaces.some((block) =>
          Math.abs(position.x + dx - block.gx * 40) <= 20.001 &&
          Math.abs(position.z + dz - block.gz * 40) <= 20.001 &&
          Math.abs(position.y - (block.gy * 40 + 40.02)) < 0.1);
        if (!supported) return false;
      }
    }
    return true;
  }

  public findPath(start: THREE.Vector3, target: THREE.Vector3): NavigationPoint[] {
    if (!this.isSafe(start) || !this.isSafe(target)) return [];
    const nearest = (position: THREE.Vector3): [string, THREE.Vector3] => [...this.nodes].reduce((best, item) =>
      item[1].distanceToSquared(position) < best[1].distanceToSquared(position) ? item : best);
    const [startId, startNode] = nearest(start);
    const [targetId, targetNode] = nearest(target);
    if (!this.safeSegment(start, startNode) || !this.safeSegment(targetNode, target)) return [];
    const open = new Set([startId]);
    const costs = new Map([[startId, 0]]);
    const cameFrom = new Map<string, { id: string; jump: boolean }>();
    while (open.size) {
      const current = [...open].sort((a, b) => costs.get(a)! + this.nodes.get(a)!.distanceTo(targetNode) - costs.get(b)! - this.nodes.get(b)!.distanceTo(targetNode))[0];
      if (current === targetId) {
        const path: NavigationPoint[] = [{ position: target.clone(), jump: false }];
        let cursor = current;
        while (cursor !== startId) {
          const previous = cameFrom.get(cursor)!;
          path.unshift({ position: this.nodes.get(cursor)!.clone(), jump: previous.jump });
          cursor = previous.id;
        }
        path.unshift({ position: startNode.clone(), jump: false });
        return path;
      }
      open.delete(current);
      for (const edge of this.edges.get(current) ?? []) {
        const cost = costs.get(current)! + this.nodes.get(current)!.distanceTo(this.nodes.get(edge.id)!);
        if (cost < (costs.get(edge.id) ?? Infinity)) {
          costs.set(edge.id, cost);
          cameFrom.set(edge.id, { id: current, jump: edge.jump });
          open.add(edge.id);
        }
      }
    }
    return [];
  }

  private safeSegment(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const steps = Math.max(1, Math.ceil(start.distanceTo(end) / 4));
    for (let index = 0; index <= steps; index += 1) if (!this.isSafe(start.clone().lerp(end, index / steps))) return false;
    return true;
  }
}
