import * as THREE from 'three';
import type { DoorConfig } from './types';
import { blockCenterY, type BlockData } from './mono/blocks';
import { CONFIG } from './mono/config';
import { penroseCycleHeight, penroseSteps, penroseStepRise } from './penrose-config';
export { penroseSteps } from './penrose-config';

export const blockSize = CONFIG.blockSize;
export const playerRadius = CONFIG.playerRadius;
export const fixedStep = 1 / 60;
export const corridorWidth = 200;
export const corridorFloorY = 20;
export const corridorStartZ = 100;

export const playgroundPlatformBlocks = (): BlockData[] => {
  const stairCells = new Set(penroseSteps.map((step) => `${step.gx}:${step.gz}`));
  const blocks: BlockData[] = [];
  for (let gx = 3; gx <= 25; gx += 1) {
    for (let gz = -5; gz <= 4; gz += 1) {
      if (!stairCells.has(`${gx}:${gz}`)) {
        blocks.push({ gx, gy: 0, gz, type: 'standard' });
      }
    }
  }
  return blocks;
};

export const blivetBlocks = (): BlockData[] => {
  const positions = new Set<string>();
  const add = (gx: number, gz: number): void => { positions.add(`${gx + 4}:1:${gz}`); };
  for (const gz of [-3, 0, 3]) for (let gx = 13; gx <= 16; gx += 1) add(gx, gz);
  for (let gz = -3; gz <= 3; gz += 1) add(16, gz);
  for (const gz of [-2, 2]) for (let gx = 16; gx <= 21; gx += 1) add(gx, gz);
  for (let gx = 17; gx <= 18; gx += 1) for (const gz of [-1, 0, 1]) add(gx, gz);
  return [...positions].map((key) => {
    const [gx, gy, gz] = key.split(':').map(Number);
    return { gx, gy, gz, type: 'standard' as const };
  });
};

export const penroseBlocks = (cycles = 0): BlockData[] => {
  const blocks: BlockData[] = [];
  for (let cycle = -cycles; cycle <= cycles; cycle += 1) {
    for (const { gx, gy, gz } of penroseSteps) {
      blocks.push({ gx, gy: cycle * 100, centerY: 15 + gy * penroseStepRise + cycle * penroseCycleHeight,
        height: 10, gz, type: 'standard' });
    }
  }
  return blocks;
};

export const doors: DoorConfig[] = [
  { id: 'notes', title: 'Notes', path: '/notes/', side: 'left', z: -160, accent: '#ffffff',
    graphics: 'notes' },
  { id: 'essays', title: 'Essays', path: '/essays/', side: 'right', z: -400, accent: '#ffffff',
    graphics: 'essays' },
  { id: 'chuan-zi', title: '击鼓传字', path: '/chuan-zi/', side: 'left', z: -640, accent: '#ffffff',
    graphics: 'chuan-zi', group: 'work' },
  { id: 'hockey', title: 'Hockey', path: '/hockey/', side: 'right', z: -880, accent: '#ffffff',
    graphics: 'hockey', group: 'work' },
];

export const corridorEndZ = Math.min(...doors.map((door) => door.z)) - 180;
export const spawn = new THREE.Vector3(0, 40.02, 40);

export function doorPosition(door: DoorConfig): THREE.Vector3 { return new THREE.Vector3(door.side === 'left' ? -80 : 80, 40.02, door.z); }

export function corridorBlocks(): BlockData[] {
  const blocks: BlockData[] = [];
  for (let gz = Math.ceil((corridorEndZ + 20) / 40); gz <= Math.floor((corridorStartZ - 20) / 40); gz += 1) {
    for (let gx = -2; gx <= 2; gx += 1) blocks.push({ gx, gy: 0, gz, type: 'standard' });
  }
  blocks.push(
    { gx: -4, gy: 0, gz: -3, type: 'standard' },
    { gx: 4, gy: 0, gz: -8, type: 'standard' },
    { gx: -4, gy: 1, gz: -3, type: 'spike' },
    { gx: 4, gy: 1, gz: -8, type: 'spike' },
  );
  return blocks;
}

export const playgroundBaseBlocks = (): BlockData[] => [
  ...playgroundPlatformBlocks(),
  ...blivetBlocks(),
];

export function playgroundBlocks(loopCopies = 2): BlockData[] {
  return [...playgroundBaseBlocks(), ...penroseBlocks(loopCopies)];
}

export function sceneBlocks(cycle = 0, loopCopies = 4): BlockData[] {
  const shift = (blocks: readonly BlockData[]): BlockData[] => blocks.map((block) => {
    if (!cycle) return block;
    return { ...block, gy: block.gy - cycle * 100, centerY: blockCenterY(block) - cycle * penroseCycleHeight };
  });
  return [...shift(corridorBlocks()), ...shift(playgroundBaseBlocks()), ...penroseBlocks(loopCopies)];
}


export function penroseJumpConnections(cycles = 0): { from: THREE.Vector3; to: THREE.Vector3 }[] {
  const connections: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  for (let cycle = -cycles; cycle <= cycles; cycle += 1) {
    for (let index = 0; index < penroseSteps.length; index += 1) {
      const from = penroseSteps[index];
      const nextCycle = index === penroseSteps.length - 1 ? cycle + 1 : cycle;
      const to = penroseSteps[(index + 1) % penroseSteps.length];
      const start = new THREE.Vector3(from.gx * blockSize, from.gy * penroseStepRise + cycle * penroseCycleHeight + playerRadius + 20.02,
        from.gz * blockSize);
      const end = new THREE.Vector3(to.gx * blockSize, to.gy * penroseStepRise + nextCycle * penroseCycleHeight + playerRadius + 20.02,
        to.gz * blockSize);
      connections.push({ from: start, to: end }, { from: end, to: start });
    }
  }
  return connections;
}

