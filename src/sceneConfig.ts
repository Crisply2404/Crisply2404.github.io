import * as THREE from 'three';
import type { DoorConfig } from './types';
import type { BlockData } from './mono/blocks';
import { CONFIG } from './mono/config';

export const blockSize = CONFIG.blockSize;
export const playerRadius = CONFIG.playerRadius;
export const fixedStep = 1 / 60;
export const corridorWidth = 200;
export const corridorFloorY = 20;
export const corridorStartZ = 100;

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

