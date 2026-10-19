export interface PenroseStep {
  gx: number;
  gz: number;
  gy: number;
}

export const penroseSteps: readonly PenroseStep[] = [
  { gx: 11, gz: -2, gy: 0 },
  { gx: 12, gz: -2, gy: 1 },
  { gx: 13, gz: -2, gy: 2 },
  { gx: 14, gz: -2, gy: 3 },
  { gx: 15, gz: -2, gy: 4 },
  { gx: 15, gz: -1, gy: 5 },
  { gx: 15, gz: 0, gy: 6 },
  { gx: 15, gz: 1, gy: 7 },
  { gx: 14, gz: 1, gy: 8 },
  { gx: 13, gz: 1, gy: 9 },
  { gx: 12, gz: 1, gy: 10 },
  { gx: 11, gz: 1, gy: 11 },
  { gx: 11, gz: 0, gy: 12 },
  { gx: 11, gz: -1, gy: 13 },
];

export const penroseCycleHeightTiles = penroseSteps.length;
export const penroseStepRise = 10;
export const penroseCycleHeight = penroseSteps.length * penroseStepRise;
