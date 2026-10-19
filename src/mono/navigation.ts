import * as THREE from 'three';
import { blockKey, blockTopY, type BlockData } from './blocks';
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

export function navigationForce(position: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const offset = target.clone().sub(position).setY(0);
  const distance = offset.length();
  const speed = Math.min(CONFIG.moveSpeed * CONFIG.friction / (1 - CONFIG.friction), Math.sqrt(2 * CONFIG.moveSpeed * distance), distance);
  const desired = offset.setLength(speed);
  return desired.multiplyScalar(1 / CONFIG.friction).sub(new THREE.Vector3(velocity.x, 0, velocity.z)).clampLength(0, CONFIG.moveSpeed);
}

export class SafetyNavigationGraph {
  private readonly nodes = new Map<string, THREE.Vector3>();
  private readonly edges = new Map<string, { id: string; jump: boolean; duration: number }[]>();
  private readonly surfaces: readonly BlockData[];

  public constructor(blocks: readonly BlockData[], jumps: readonly JumpConnection[] = []) {
    const occupied = new Map(blocks.map((block) => [blockKey(block.gx, block.gy, block.gz), block]));
    this.surfaces = blocks.filter((block) => block.type === 'standard' && !occupied.has(blockKey(block.gx, block.gy + 1, block.gz)));
    for (const block of this.surfaces) {
      if (occupied.has(blockKey(block.gx, block.gy + 1, block.gz))) continue;
      const position = new THREE.Vector3(block.gx * 40, blockTopY(block) + 20.02, block.gz * 40);
      this.nodes.set(position.toArray().join(':'), position);
    }
    for (const [id, position] of this.nodes) {
      if (this.isSafe(position)) this.edges.set(id, []);
      else this.nodes.delete(id);
    }
    const physics = jumps.length ? new PhysicsEngine(blocks) : undefined;
    const player = new PlayerState();
    for (const connection of jumps) {
      const from = [...this.nodes].find(([, position]) => position.distanceTo(connection.from) < 0.1)?.[0];
      const to = [...this.nodes].find(([, position]) => position.distanceTo(connection.to) < 0.1)?.[0];
      if (!from || !to || !this.isSafe(connection.from) || !this.isSafe(connection.to)) {
        throw new Error('Jump connection requires safe endpoints');
      }
      player.place(connection.from);
      player.grounded = true;
      player.jumpBuffer = 8;
      let reached = false;
      let duration = 0;
      for (let tick = 0; tick < 90; tick += 1) {
        const force = navigationForce(player.pos, player.vel, connection.to);
        if (!physics!.step(player, force)) break;
        if (player.grounded && player.pos.distanceTo(connection.to) < 0.5) {
          reached = true;
          duration = tick + 1;
          break;
        }
        if (player.pos.y < connection.to.y - 100) break;
      }
      if (!reached) throw new Error('Jump connection has no safe physical trajectory');
      this.edges.get(from)!.push({ id: to, jump: true, duration });
    }
    physics?.dispose();
  }

  public isSafe(position: THREE.Vector3): boolean {
    for (const dx of [-20, 0, 20]) {
      for (const dz of [-20, 0, 20]) {
        const supported = this.surfaces.some((block) =>
          Math.abs(position.x + dx - block.gx * 40) <= 20.001 &&
          Math.abs(position.z + dz - block.gz * 40) <= 20.001 &&
          Math.abs(position.y - (blockTopY(block) + 20.02)) < 0.1);
        if (!supported) return false;
      }
    }
    return true;
  }

  public findPath(start: THREE.Vector3, target: THREE.Vector3): NavigationPoint[] {
    if (!this.isSafe(start) || !this.isSafe(target)) return [];
    if (this.safeSegment(start, target)) return [{ position: target.clone(), jump: false }];
    const startId = 'start', targetId = 'target';
    const nodes = new Map(this.nodes);
    nodes.set(startId, start); nodes.set(targetId, target);
    const open = new Set([startId]);
    const costs = new Map([[startId, 0]]);
    const cameFrom = new Map<string, { id: string; jump: boolean }>();
    while (open.size) {
      const current = [...open].sort((a, b) => costs.get(a)! + nodes.get(a)!.distanceTo(target) / CONFIG.maxSpeed
        - costs.get(b)! - nodes.get(b)!.distanceTo(target) / CONFIG.maxSpeed)[0];
      if (current === targetId) {
        const path: NavigationPoint[] = [];
        let cursor = current;
        while (cursor !== startId) {
          const previous = cameFrom.get(cursor)!;
          path.unshift({ position: nodes.get(cursor)!.clone(), jump: previous.jump });
          cursor = previous.id;
        }
        return path;
      }
      open.delete(current);
      const origin = nodes.get(current)!;
      const neighbors = [...(this.edges.get(current) ?? []).filter((edge) => edge.jump)];
      for (const [id, position] of nodes) {
        if (id !== current && this.safeSegment(origin, position)) {
          neighbors.push({ id, jump: false, duration: origin.distanceTo(position) / this.walkSpeed });
        }
      }
      for (const edge of neighbors) {
        const cost = costs.get(current)! + edge.duration;
        if (cost < (costs.get(edge.id) ?? Infinity)) {
          costs.set(edge.id, cost);
          cameFrom.set(edge.id, { id: current, jump: edge.jump });
          open.add(edge.id);
        }
      }
    }
    return [];
  }

  private readonly walkSpeed = CONFIG.moveSpeed * CONFIG.friction / (1 - CONFIG.friction);

  private safeSegment(start: THREE.Vector3, end: THREE.Vector3): boolean {
    if (Math.abs(start.y - end.y) > 0.1) return false;
    // 每条支撑线与方块顶部的交集覆盖整个路径区间。
    for (const dx of [-20, 0, 20]) for (const dz of [-20, 0, 20]) {
      const intervals: [number, number][] = [];
      for (const block of this.surfaces) {
        if (Math.abs(start.y - (blockTopY(block) + 20.02)) > 0.1) continue;
        let from = 0, to = 1;
        for (const [origin, delta, center] of [[start.x + dx, end.x - start.x, block.gx * 40], [start.z + dz, end.z - start.z, block.gz * 40]]) {
          if (Math.abs(delta) < 0.000001) {
            if (Math.abs(origin - center) > 20.001) { to = -1; break; }
          } else {
            const a = (center - 20.001 - origin) / delta, b = (center + 20.001 - origin) / delta;
            from = Math.max(from, Math.min(a, b)); to = Math.min(to, Math.max(a, b));
          }
        }
        if (from <= to) intervals.push([from, to]);
      }
      intervals.sort((a, b) => a[0] - b[0]);
      let covered = 0;
      for (const [from, to] of intervals) {
        if (from > covered) break;
        covered = Math.max(covered, to);
      }
      if (covered < 1) return false;
    }
    return true;
  }
}
