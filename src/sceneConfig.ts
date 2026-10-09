import type { DoorConfig, NavigationNode } from './types';

export const corridorWidth = 180;
export const corridorFloorY = 0;
export const corridorStartZ = 120;
export const corridorEndPadding = 180;
export const playerRadius = 20;
export const blockSize = 40;
export const fixedStep = 1 / 60;

export const doors: DoorConfig[] = [
  { id: 'notes', title: 'NOTES', path: '/notes/', side: 'left', z: -180, accent: '#ffffff' },
  { id: 'essays', title: 'ESSAYS', path: '/essays/', side: 'right', z: -420, accent: '#ffffff' },
  { id: 'chuan-zi', title: '击鼓传字', path: '/chuan-zi/', side: 'left', z: -660, accent: '#ffffff' },
];

export const corridorEndZ = Math.min(...doors.map((door) => door.z)) - corridorEndPadding;

export const navigationNodes: NavigationNode[] = Array.from(
  { length: Math.ceil((corridorStartZ - corridorEndZ) / blockSize) + 1 },
  (_, index) => ({
    id: `center-${index}`,
    x: 0,
    z: corridorStartZ - index * blockSize,
  }),
);

export function createNavigationNodes(): NavigationNode[] {
  const nodes: NavigationNode[] = [];
  const xValues = [-60, -30, 0, 30, 60];
  const zCount = Math.ceil((corridorStartZ - corridorEndZ) / blockSize) + 1;

  for (let zIndex = 0; zIndex < zCount; zIndex += 1) {
    const z = corridorStartZ - zIndex * blockSize;
    for (const x of xValues) {
      nodes.push({ id: `${x}:${z}`, x, z });
    }
  }

  return nodes;
}

