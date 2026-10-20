export type ViewMode = 'game' | 'list';

export type DoorSide = 'left' | 'right';
export type DoorGraphicId = 'notes' | 'essays' | 'chuan-zi' | 'hockey';

export interface DoorGraphics {
  title?: string;
  symbol: string;
}

export interface DoorConfig {
  id: string;
  title: string;
  path: string;
  side: DoorSide;
  z: number;
  accent: string;
  graphics: DoorGraphicId;
  group?: 'work';
  appearance?: 'open' | 'completed' | 'exit';
}

export interface NavigationNode {
  id: string;
  x: number;
  z: number;
  jumpTo?: string;
  blocked?: boolean;
}

export interface AvatarState {
  space?: 'blivet';
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  updatedAt: number;
}

export interface PresenceMessage {
  type: 'state' | 'join' | 'leave' | 'snapshot' | 'speech';
  id?: string;
  avatar?: Omit<AvatarState, 'updatedAt'>;
  avatars?: Array<Omit<AvatarState, 'updatedAt'>>;
  text?: string;
  durationMs?: number;
}

