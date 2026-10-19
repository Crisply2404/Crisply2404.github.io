import * as THREE from 'three';
import { CONFIG } from './config';

export interface BlockData { gx: number; gy: number; gz: number; type: 'standard' | 'spike'; centerY?: number; height?: number }
export type Segment = readonly [THREE.Vector3, THREE.Vector3];
export const blockKey = (x: number, y: number, z: number): string => `${x}:${y}:${z}`;

export const blockCenterY = (block: BlockData): number => block.centerY ?? block.gy * CONFIG.blockSize;
export const blockHeight = (block: BlockData): number => block.height ?? CONFIG.blockSize;
export const blockTopY = (block: BlockData): number => blockCenterY(block) + blockHeight(block) / 2;

export function buildEdges(blocks: readonly BlockData[]): Segment[] {
  const blockMap = new Map(blocks.map((block) => [blockKey(block.gx, block.gy, block.gz), block]));
  if (blockMap.size !== blocks.length) throw new Error('Duplicate block coordinates');
  const candidates = new Map<string, [number, number, number, number]>();
  const segments = new Map<string, Segment>();
  const addEdge = (start: THREE.Vector3, end: THREE.Vector3): void => {
    const forward = start.x < end.x || (start.x === end.x && (start.y < end.y || (start.y === end.y && start.z < end.z)));
    const a = forward ? start : end;
    const b = forward ? end : start;
    segments.set(`${a.toArray()}:${b.toArray()}`, [a, b]);
  };
  if (blocks.some((block) => block.centerY !== undefined)) {
    const regularEdges = buildEdges(blocks.filter((block) => block.centerY === undefined));
    for (const block of blocks.filter((candidate) => candidate.centerY !== undefined)) {
      if (block.type !== 'standard') continue;
      const center = new THREE.Vector3(block.gx * CONFIG.blockSize, blockCenterY(block), block.gz * CONFIG.blockSize);
      const half = CONFIG.blockSize / 2;
      const halfHeight = blockHeight(block) / 2;
      const corners = [
        new THREE.Vector3(-half, -halfHeight, -half), new THREE.Vector3(half, -halfHeight, -half),
        new THREE.Vector3(half, -halfHeight, half), new THREE.Vector3(-half, -halfHeight, half),
        new THREE.Vector3(-half, halfHeight, -half), new THREE.Vector3(half, halfHeight, -half),
        new THREE.Vector3(half, halfHeight, half), new THREE.Vector3(-half, halfHeight, half),
      ].map((corner) => corner.add(center));
      for (const [from, to] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const) {
        addEdge(corners[from], corners[to]);
      }
    }
    return [...regularEdges, ...segments.values()];
  }
  for (const block of blocks) {
    if (block.type === 'spike') {
      const center = new THREE.Vector3(block.gx, block.gy, block.gz).multiplyScalar(CONFIG.blockSize);
      center.y -= CONFIG.blockSize / 2;
      const top = center.clone().add(new THREE.Vector3(0, CONFIG.blockSize, 0));
      const corners = [[20, 0, 20], [20, 0, -20], [-20, 0, -20], [-20, 0, 20]]
        .map((point) => new THREE.Vector3(...point as [number, number, number]).add(center));
      for (let index = 0; index < 4; index += 1) {
        addEdge(top, corners[index]);
        addEdge(corners[index], corners[(index + 1) % 4]);
      }
      continue;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      for (let first = 0; first < 2; first += 1) {
        for (let second = 0; second < 2; second += 1) {
          const start = [block.gx, block.gy, block.gz];
          start[(axis + 1) % 3] += first;
          start[(axis + 2) % 3] += second;
          candidates.set(`${start}:${axis}`, [...start, axis] as [number, number, number, number]);
        }
      }
    }
  }
  for (const [x, y, z, axis] of candidates.values()) {
    const start = new THREE.Vector3(x, y, z);
    const first = new THREE.Vector3().setComponent((axis + 1) % 3, 1);
    const second = new THREE.Vector3().setComponent((axis + 2) % 3, 1);
    const neighbors = [start.clone().sub(first).sub(second), start.clone().sub(second), start, start.clone().sub(first)];
    let mask = 0;
    let count = 0;
    neighbors.forEach((point, index) => {
      if (blockMap.get(blockKey(point.x, point.y, point.z))?.type === 'standard') {
        mask |= 1 << index;
        count += 1;
      }
    });
    if (count === 1 || count === 3 || mask === 5 || mask === 10) {
      const end = start.clone().setComponent(axis, start.getComponent(axis) + 1);
      addEdge(start.clone().multiplyScalar(40).subScalar(20), end.multiplyScalar(40).subScalar(20));
    }
  }
  return [...segments.values()];
}
