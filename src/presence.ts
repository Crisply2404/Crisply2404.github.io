import type { AvatarState, PresenceMessage } from './types';

export type PresenceListener = (avatars: Map<string, AvatarState>) => void;

export class PresenceClient {
  private readonly url: string;
  private readonly id: string;
  private readonly listener: PresenceListener;
  private socket: WebSocket | undefined;
  private reconnectTimer: number | undefined;
  private destroyed = false;
  private readonly avatars = new Map<string, AvatarState>();

  public constructor(url: string | undefined, listener: PresenceListener) {
    this.url = url ?? '';
    this.id = crypto.randomUUID();
    this.listener = listener;
    if (this.url) {
      this.connect();
    }
  }

  public publish(avatar: Omit<AvatarState, 'id' | 'updatedAt'>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'state', avatar }));
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
    this.avatars.clear();
  }

  private connect(): void {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', () => {
      this.socket?.send(JSON.stringify({ type: 'join', id: this.id }));
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as PresenceMessage;
      this.consume(message);
    });
    this.socket.addEventListener('error', () => undefined);
    this.socket.addEventListener('close', () => {
      if (this.destroyed) return;
      this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
    });
  }

  private consume(message: PresenceMessage): void {
    if (message.type === 'snapshot' && message.avatars) {
      this.avatars.clear();
      for (const avatar of message.avatars) {
        if (avatar.id !== this.id) {
          this.avatars.set(avatar.id, { ...avatar, updatedAt: performance.now() });
        }
      }
    }

    if (message.type === 'state' && message.avatar && message.avatar.id !== this.id) {
      this.avatars.set(message.avatar.id, { ...message.avatar, updatedAt: performance.now() });
    }

    if (message.type === 'leave' && message.id) {
      this.avatars.delete(message.id);
    }

    this.listener(new Map(this.avatars));
  }
}
