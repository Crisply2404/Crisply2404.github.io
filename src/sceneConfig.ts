import * as THREE from 'three';
import type { DoorConfig } from './types';
import type { BlockData } from './mono/blocks';
import { CONFIG } from './mono/config';
import { penroseFloorBlocks } from './mono/penrose';

export const blockSize = CONFIG.blockSize;
export const playerRadius = CONFIG.playerRadius;
export const fixedStep = 1 / 60;
export const corridorWidth = 200;
export const corridorFloorY = 20;
export const corridorStartZ = 100;

export const playgroundPlatformBlocks = (): BlockData[] => {
  const blocks: BlockData[] = [];
  for (let gx = 3; gx <= 42; gx += 1) {
    for (let gz = -16; gz <= 8; gz += 1) {
      if (!(gx >= 11 && gx <= 15 && gz >= -2 && gz <= 2) && !(gx === 4 && gz === -8)) {
        blocks.push({ gx, gy: 0, gz, type: 'standard' });
      }
    }
  }
  return blocks;
};

export const blivetApproachBlocks = (): BlockData[] => [
  { gx: 9, gy: 1, gz: -2, centerY: 30, height: 20, type: 'standard' },
  { gx: 10, gy: 1, gz: -2, centerY: 48, height: 16, type: 'standard' },
  { gx: 25, gy: 1, gz: -1, centerY: 30, height: 20, type: 'standard' },
  { gx: 25, gy: 1, gz: -2, type: 'standard' },
];

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

export function sceneBlocks(): BlockData[] {
  return [...corridorBlocks(), ...playgroundPlatformBlocks(), ...penroseFloorBlocks(), ...blivetApproachBlocks()];
}


export function playgroundJumpConnections(): { from: THREE.Vector3; to: THREE.Vector3 }[] {
  const points = [new THREE.Vector3(1000, 40.02, 0), new THREE.Vector3(1000, 60.02, -40), new THREE.Vector3(1000, 80.02, -80)];
  const stairs = [new THREE.Vector3(320, 40.02, -80), new THREE.Vector3(360, 60.02, -80),
    new THREE.Vector3(400, 76.02, -80), new THREE.Vector3(440, 92.02, -80)];
  return [points, stairs].flatMap((route) => route.slice(1).flatMap((point, index) =>
    [{ from: route[index], to: point }, { from: point, to: route[index] }]));
}

