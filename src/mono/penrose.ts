import * as THREE from 'three';
import { penroseBaseY, penroseCycleHeight, penroseOrigin, penroseSideSteps, penroseStepCount, penroseStepRise } from '../penrose-config';
import { CONFIG, VIEWPORT } from './config';
import type { BlockData, Segment } from './blocks';

export interface StairFace { corners: THREE.Vector3[]; start: number; end: number; height: number }

const side = penroseSideSteps * CONFIG.blockSize;
const corners = [[0, 0], [side, 0], [side, side], [0, side]];
const miters = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function ribbon(t: number, across: number): THREE.Vector3 {
  const index = Math.min(3, Math.floor(t / penroseSideSteps));
  const amount = (t - index * penroseSideSteps) / penroseSideSteps, next = (index + 1) % 4;
  return new THREE.Vector3(
    penroseOrigin.x + THREE.MathUtils.lerp(corners[index][0] + miters[index][0] * across,
      corners[next][0] + miters[next][0] * across, amount), penroseBaseY,
    penroseOrigin.z + THREE.MathUtils.lerp(corners[index][1] + miters[index][1] * across,
      corners[next][1] + miters[next][1] * across, amount));
}

export const penroseFaces: readonly StairFace[] = Array.from({ length: penroseStepCount }, (_, index) => ({
  corners: [ribbon(index, -20), ribbon(index + 1, -20), ribbon(index + 1, 20), ribbon(index, 20)],
  start: index, end: index + 1, height: penroseBaseY + index * penroseStepRise,
}));

export function penroseFloorBlocks(): BlockData[] {
  const blocks: BlockData[] = [];
  for (let x = 0; x <= 4; x += 1) for (let z = 0; z <= 4; z += 1) {
    if (x === 0 || x === 4 || z === 0 || z === 4) blocks.push({ gx: 11 + x, gy: 1, gz: -2 + z,
      centerY: 46, height: 52, type: 'standard' });
  }
  return blocks;
}

export function stairRay(angle: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(angle) * VIEWPORT.cameraDistance / VIEWPORT.cameraHeight, 1,
    Math.cos(angle) * VIEWPORT.cameraDistance / VIEWPORT.cameraHeight);
}

export function stairPoint(point: THREE.Vector3, t: number, height: number, angle: number): THREE.Vector3 {
  const shift = stairRay(angle).multiplyScalar(t * penroseStepRise);
  shift.y = height - penroseBaseY;
  return point.clone().add(shift);
}

function closestOnFace(point: THREE.Vector3, corners: readonly THREE.Vector3[]): { t: number; distance: number } {
  let closest = { t: 0, distance: Infinity };
  for (const indices of [[0, 1, 2], [0, 2, 3]]) {
    const triangle = new THREE.Triangle(...indices.map((index) => corners[index]) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    const planar = point.clone().setY(penroseBaseY);
    const candidate = triangle.closestPointToPoint(planar, new THREE.Vector3());
    const weights = triangle.getBarycoord(candidate, new THREE.Vector3())!;
    const t = weights.toArray().reduce((sum, weight, index) => sum + weight * Number(indices[index] === 1 || indices[index] === 2), 0);
    const distance = candidate.distanceToSquared(planar);
    if (distance < closest.distance) closest = { t, distance };
  }
  return closest;
}

export class PenroseLoop {
  public cycle = 0;
  private progress: number | undefined;

  public reset(): void { this.cycle = 0; this.progress = undefined; }

  public locate(position: THREE.Vector3): { face: StairFace; t: number; distance: number } {
    let result = { face: penroseFaces[0], t: 0, distance: Infinity };
    for (const face of penroseFaces) {
      const candidate = closestOnFace(position, face.corners);
      if (candidate.distance < result.distance) result = {
        face, t: THREE.MathUtils.lerp(face.start, face.end, candidate.t), distance: candidate.distance,
      };
    }
    return result;
  }

  public track(position: THREE.Vector3): void {
    const { t, distance } = this.locate(position);
    if (distance > 0.01 || position.y < penroseBaseY) { this.progress = undefined; return; }
    if (this.progress !== undefined) {
      if (this.progress > penroseStepCount - 2 && t < 2) this.cycle += 1;
      if (this.progress < 2 && t > penroseStepCount - 2) this.cycle -= 1;
    }
    this.progress = t;
  }

  public renderPosition(position: THREE.Vector3, angle: number): THREE.Vector3 {
    const { t, face, distance } = this.locate(position);
    if (distance > CONFIG.playerRadius ** 2 || position.y < penroseBaseY - CONFIG.playerRadius * 2) return position.clone();
    const weight = (1 - THREE.MathUtils.smoothstep(Math.sqrt(distance), 0, CONFIG.playerRadius))
      * THREE.MathUtils.smoothstep(position.y, penroseBaseY - CONFIG.playerRadius * 2, penroseBaseY - CONFIG.playerRadius);
    const transformed = stairPoint(position, t, face.height, angle);
    // 相邻空间页提供接缝两侧的球面接触高度。
    let supportedY = -Infinity;
    for (const neighbor of penroseFaces) {
      let lift = 0;
      if (neighbor.start - t > penroseStepCount / 2) lift = -penroseStepCount;
      if (neighbor.end - t < -penroseStepCount / 2) lift = penroseStepCount;
      if (Math.abs(neighbor.start + lift - t) > 2) continue;
      const points = neighbor.corners.map((point, index) => stairPoint(point,
        (index === 1 || index === 2 ? neighbor.end : neighbor.start) + lift,
        neighbor.height + lift * penroseStepRise, angle).setY(penroseBaseY));
      const nearest = closestOnFace(transformed, points);
      if (nearest.distance <= CONFIG.playerRadius ** 2) supportedY = Math.max(supportedY,
        neighbor.height + lift * penroseStepRise + Math.sqrt(CONFIG.playerRadius ** 2 - nearest.distance));
    }
    if (!Number.isFinite(supportedY)) throw new Error('Penrose contact has no supporting tread');
    transformed.y = supportedY + position.y - (penroseBaseY + CONFIG.playerRadius);
    // 接缝附近沿观察射线连续连接深度页，保持球体与前方台阶的遮挡。
    transformed.addScaledVector(stairRay(angle), penroseCycleHeight * (1 - THREE.MathUtils.smoothstep(t, 0, 2)));
    return position.clone().lerp(transformed, weight);
  }

  public geometry(angle: number): { positions: number[]; segments: Segment[] } {
    const positions: number[] = [], segments: Segment[] = [];
    const quad = (points: THREE.Vector3[]): void => {
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...points[index].toArray());
    };
    for (const face of penroseFaces) {
      const top = face.corners.map((point, index) => stairPoint(point,
        index === 1 || index === 2 ? face.end : face.start, face.height, angle));
      const bottom = face.corners.map((point, index) => {
        const t = index === 1 || index === 2 ? face.end : face.start;
        return stairPoint(point, t, penroseBaseY + t * penroseStepRise - 52, angle);
      });
      quad(top); quad([top[0], top[1], bottom[1], bottom[0]]);
      quad([top[2], top[3], bottom[3], bottom[2]]); quad(bottom);
      const rise = new THREE.Vector3(0, penroseStepRise, 0);
      quad([top[1], top[2], top[2].clone().add(rise), top[1].clone().add(rise)]);
      segments.push([top[0], top[1]], [top[2], top[3]], [top[1], top[2]],
        [top[1], top[1].clone().add(rise)], [top[2], top[2].clone().add(rise)],
        [bottom[0], bottom[1]], [bottom[2], bottom[3]]);
      if (face.start % penroseSideSteps === 0) segments.push([top[0], bottom[0]], [top[3], bottom[3]]);
    }
    return { positions, segments };
  }

  public inverseSurface(point: THREE.Vector3, angle: number): THREE.Vector3 | undefined {
    for (const face of penroseFaces) {
      if (Math.abs(point.y - face.height) > 0.1) continue;
      const transformed = face.corners.map((corner, index) => stairPoint(corner,
        index === 1 || index === 2 ? face.end : face.start, face.height, angle));
      const candidate = closestOnFace(point, transformed.map((corner) => corner.clone().setY(penroseBaseY)));
      if (candidate.distance > 0.01) continue;
      const t = THREE.MathUtils.lerp(face.start, face.end, candidate.t);
      const result = point.clone().addScaledVector(stairRay(angle), -t * penroseStepRise);
      result.y = penroseBaseY + CONFIG.playerRadius + 0.02;
      const centerlines = corners.map((corner, index) => new THREE.Line3(
        new THREE.Vector3(corner[0] + penroseOrigin.x, result.y, corner[1] + penroseOrigin.z),
        new THREE.Vector3(corners[(index + 1) % 4][0] + penroseOrigin.x, result.y,
          corners[(index + 1) % 4][1] + penroseOrigin.z)));
      return centerlines.map((line) => line.closestPointToPoint(result, true, new THREE.Vector3()))
        .sort((a, b) => a.distanceToSquared(result) - b.distanceToSquared(result))[0];
    }
    return undefined;
  }

  public surfacePosition(position: THREE.Vector3, angle: number): THREE.Vector3 {
    const { t, face } = this.locate(position);
    return stairPoint(position.clone().setY(penroseBaseY), t, face.height, angle);
  }
}
