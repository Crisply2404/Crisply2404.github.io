import * as THREE from 'three';
import { VIEWPORT } from './config';
import type { Segment } from './blocks';
import { navigationForce } from './navigation';
import { PhysicsEngine, PlayerState } from './physics';

export const blivetEntry = new THREE.Vector3(1000, 80.02, -80);
export const blivetLocalEntry = new THREE.Vector3(0, 80.02, -80);
const lanes = [-80, 0, 80];
const screenVertical = VIEWPORT.cameraHeight / Math.hypot(VIEWPORT.cameraDistance, VIEWPORT.cameraHeight);
const rodCrown = 20 * Math.sqrt(0.8);

export interface BlivetRail { from: THREE.Vector3; to: THREE.Vector3 }
const point = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 80.02, z);
export const blivetRails: readonly BlivetRail[] = [
  ...lanes.map((z) => ({ from: point(0, z), to: point(320, z) })),
  { from: point(320, -80), to: point(420, -40) },
  { from: point(320, 0), to: point(420, 80) },
  { from: point(320, 80), to: point(420, 80) },
  { from: point(420, -40), to: point(460, -40) },
  { from: point(420, 80), to: point(460, 80) },
  { from: point(460, -40), to: point(460, 80) },
];

function closestRail(position: THREE.Vector3): { index: number; point: THREE.Vector3; distance: number } {
  let closest = { index: 0, point: blivetRails[0].from.clone(), distance: Infinity };
  blivetRails.forEach((rail, index) => {
    const candidate = new THREE.Line3(rail.from, rail.to).closestPointToPoint(position.clone().setY(80.02), true, new THREE.Vector3());
    const distance = candidate.clone().sub(position).setY(0).length();
    if (distance < closest.distance) closest = { index, point: candidate, distance };
  });
  return closest;
}

export function blivetHulls(): Float32Array[] {
  const hulls: Float32Array[] = [];
  for (const z of lanes) {
    const vertices: number[] = [];
    for (const x of [-20, 340]) for (let index = 0; index < 64; index += 1) {
      const angle = index * Math.PI / 32;
      vertices.push(x, 40 + Math.cos(angle) * 20, z + Math.sin(angle) * 20);
    }
    hulls.push(new Float32Array(vertices));
  }
  for (const rail of blivetRails.slice(3)) {
    const direction = rail.to.clone().sub(rail.from).setY(0).normalize();
    const across = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(20);
    const vertices: number[] = [];
    for (const end of [rail.from.clone().addScaledVector(direction, -20), rail.to.clone().addScaledVector(direction, 20)]) {
      for (const y of [20, 60]) for (const sign of [-1, 1]) vertices.push(...end.clone().addScaledVector(across, sign).setY(y).toArray());
    }
    hulls.push(new Float32Array(vertices));
  }
  return hulls;
}

export class BlivetSpace {
  public readonly physics = new PhysicsEngine([], blivetHulls());
  public readonly artAngle = Math.atan(screenVertical);

  public dispose(): void { this.physics.dispose(); }

  public artToWorld(art: THREE.Vector2, angle: number, height = 60): THREE.Vector3 {
    const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const x = art.x - 34, y = art.y - (60 + rodCrown);
    return blivetEntry.clone().setY(height)
      .addScaledVector(right, x * Math.cos(this.artAngle) - y * Math.sin(this.artAngle))
      .addScaledVector(forward, -(x * Math.sin(this.artAngle) + y * Math.cos(this.artAngle)) / screenVertical);
  }

  public floorArt(position: THREE.Vector3): THREE.Vector2 {
    const x = position.x, z = position.z;
    const lane = lanes.reduce((best, candidate) => Math.abs(z - candidate) < Math.abs(z - best) ? candidate : best, lanes[0]);
    const across = THREE.MathUtils.clamp(z - lane, -20, 20);
    const blend = THREE.MathUtils.smoothstep(x, 280, 320);
    return new THREE.Vector2(34 + x + 0.671715 * across * (1 - blend),
      140 + z + (rodCrown - 0.5527864 * across) * (1 - blend));
  }

  public renderPosition(position: THREE.Vector3, angle: number): THREE.Vector3 {
    const floor = this.artToWorld(this.floorArt(position), angle);
    floor.y += position.y - 60;
    return floor;
  }

  public worldForce(force: THREE.Vector3, angle: number): THREE.Vector3 {
    const x = force.x * Math.cos(angle) - force.z * Math.sin(angle);
    const y = -(force.x * Math.sin(angle) + force.z * Math.cos(angle));
    return new THREE.Vector3(x * Math.cos(this.artAngle) + y * Math.sin(this.artAngle), 0,
      -x * Math.sin(this.artAngle) + y * Math.cos(this.artAngle));
  }

  public inverseSurface(position: THREE.Vector3, angle: number): THREE.Vector3 | undefined {
    const delta = position.clone().sub(blivetEntry);
    const horizontal = delta.x * Math.cos(angle) - delta.z * Math.sin(angle);
    const vertical = -(delta.x * Math.sin(angle) + delta.z * Math.cos(angle)) * screenVertical;
    const x = horizontal * Math.cos(this.artAngle) + vertical * Math.sin(this.artAngle) + 34;
    const y = -horizontal * Math.sin(this.artAngle) + vertical * Math.cos(this.artAngle) + 60 + rodCrown;
    let best: THREE.Vector3 | undefined, distance = Infinity;
    for (const rail of blivetRails) {
      for (let index = 0; index < 40; index += 1) {
        const from = rail.from.clone().lerp(rail.to, index / 40);
        const to = rail.from.clone().lerp(rail.to, (index + 1) / 40);
        const a = this.floorArt(from), b = this.floorArt(to), delta = b.clone().sub(a);
        const amount = THREE.MathUtils.clamp(new THREE.Vector2(x, y).sub(a).dot(delta) / delta.lengthSq(), 0, 1);
        const error = a.addScaledVector(delta, amount).distanceTo(new THREE.Vector2(x, y));
        if (error < distance) { best = from.lerp(to, amount); distance = error; }
      }
    }
    return distance <= 18 ? best : undefined;
  }

  public path(start: THREE.Vector3, target: THREE.Vector3): THREE.Vector3[] {
    const a = closestRail(start), b = closestRail(target);
    if (a.distance > 20 || b.distance > 18) return [];
    if (a.index === b.index) return [target.clone()];
    const nodes = new Map<string, THREE.Vector3>();
    const edges = new Map<string, Map<string, number>>();
    const key = (position: THREE.Vector3): string => `${position.x}:${position.z}`;
    const connect = (from: THREE.Vector3, to: THREE.Vector3): void => {
      const first = key(from), second = key(to);
      nodes.set(first, from); nodes.set(second, to);
      if (!edges.has(first)) edges.set(first, new Map());
      if (!edges.has(second)) edges.set(second, new Map());
      edges.get(first)!.set(second, from.distanceTo(to)); edges.get(second)!.set(first, from.distanceTo(to));
    };
    blivetRails.forEach((rail, index) => {
      const stops = [rail.from, rail.to, ...(index === a.index ? [a.point] : []), ...(index === b.index ? [b.point] : [])]
        .sort((first, second) => first.distanceToSquared(rail.from) - second.distanceToSquared(rail.from));
      for (let i = 1; i < stops.length; i += 1) connect(stops[i - 1], stops[i]);
    });
    const origin = key(a.point), end = key(b.point), open = new Set([origin]);
    const costs = new Map([[origin, 0]]), previous = new Map<string, string>();
    while (open.size) {
      const current = [...open].sort((first, second) => costs.get(first)! - costs.get(second)!)[0];
      if (current === end) {
        const result = [target.clone()];
        let cursor = end;
        while (cursor !== origin) { result.unshift(nodes.get(cursor)!.clone()); cursor = previous.get(cursor)!; }
        return result.filter((position, index) => index > 0 || position.distanceTo(start) > 0.5);
      }
      open.delete(current);
      for (const [neighbor, length] of edges.get(current)!) {
        const cost = costs.get(current)! + length;
        if (cost >= (costs.get(neighbor) ?? Infinity)) continue;
        costs.set(neighbor, cost); previous.set(neighbor, current); open.add(neighbor);
      }
    }
    return [];
  }

  public verifyPath(start: THREE.Vector3, path: readonly THREE.Vector3[]): boolean {
    const player = new PlayerState(); player.place(start);
    for (const target of path) {
      let reached = false;
      for (let tick = 0; tick < 240; tick += 1) {
        if (!this.physics.step(player, navigationForce(player.pos, player.vel, target)) || player.pos.y < 55) return false;
        if (player.pos.clone().sub(target).setY(0).length() < 0.5 && player.grounded) { reached = true; break; }
      }
      if (!reached) return false;
    }
    return true;
  }

  public outline(source: THREE.Vector2[][], angle: number): Segment[] {
    return source.flatMap((path) => path.slice(1).flatMap((point, index): Segment[] => point.equals(path[index]) ? []
      : [[this.artToWorld(path[index], angle), this.artToWorld(point, angle)]]));
  }
}
