export type ViewMode = 'game' | 'list';

export type DoorSide = 'left' | 'right';

export interface DoorConfig {
  id: string;
  title: string;
  path: string;
  side: DoorSide;
  z: number;
  accent: string;
}

export interface NavigationNode {
  id: string;
  x: number;
  z: number;
  jumpTo?: string;
  blocked?: boolean;
}

export interface AvatarState {
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
  type: 'state' | 'join' | 'leave' | 'snapshot';
  id?: string;
  avatar?: Omit<AvatarState, 'updatedAt'>;
  avatars?: Array<Omit<AvatarState, 'updatedAt'>>;
}

