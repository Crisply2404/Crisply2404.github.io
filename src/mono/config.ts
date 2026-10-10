export const CONFIG = {
  blockSize: 40,
  thickness: 2.5,
  gravity: 0.65,
  jumpForce: 10,
  moveSpeed: 1.2,
  friction: 0.82,
  maxSpeed: 10,
  playerRadius: 20,
} as const;

export const PHYSICS = {
  coyoteFrames: 6,
  jumpBufferFrames: 8,
  jumpCutMultiplier: 0.5,
  safeMargin: 0.01,
  sideContactTolerance: 0.02,
} as const;

export const VIEWPORT = { frustumSize: 800, cameraDistance: 800, cameraHeight: 640 } as const;
export type WasdOrientation = 0 | 1 | 2;

export function movementDirection(x: number, y: number, angle: number, orientation: WasdOrientation): [number, number] {
  if (orientation === 2) {
    return [Math.sin(angle) * y + Math.cos(angle) * x, Math.cos(angle) * y - Math.sin(angle) * x];
  }
  // Godot roundi 在负数中点朝远离零的方向取整。
  const turns = (angle - Math.PI / 4) / (Math.PI / 2);
  const quarterTurns = Math.sign(turns) * Math.floor(Math.abs(turns) + 0.5) + (orientation === 0 ? 1 : 0);
  const axisAngle = quarterTurns * Math.PI / 2;
  return [Math.round(Math.sin(axisAngle)) * y + Math.round(Math.cos(axisAngle)) * x,
    Math.round(Math.cos(axisAngle)) * y - Math.round(Math.sin(axisAngle)) * x];
}
