import type { AvatarState, PresenceMessage } from './types';
import { speechDuration, speechSendInterval, type SpeechMessage } from './presence-rules';

export type PresenceListener = (avatars: Map<string, AvatarState>) => void;

export class PresenceClient {
  private readonly url: string;
  private readonly id: string;
  private readonly listener: PresenceListener;
  private socket: WebSocket | undefined;
  private reconnectTimer: number | undefined;
  private destroyed = false;
  private latest: Omit<AvatarState, 'id' | 'updatedAt'> | undefined;
  private previousState: Omit<AvatarState, 'id' | 'updatedAt'> | undefined;
  private lastSentAt = 0;
  private lastSpeechAt = Number.NEGATIVE_INFINITY;
  private readonly avatars = new Map<string, AvatarState>();

  public constructor(url: string | undefined, listener: PresenceListener,
    private readonly onSpeech: (message: SpeechMessage) => void = () => undefined) {
    this.url = url ?? '';
    this.id = crypto.randomUUID();
    this.listener = listener;
    if (this.url) {
      this.connect();
    }
  }

  public publish(avatar: Omit<AvatarState, 'id' | 'updatedAt'>): void {
    this.latest = avatar;
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = performance.now();
    if (now - this.lastSentAt < 100) return;
    const previous = this.previousState;
    if (previous && Math.hypot(avatar.x - previous.x, avatar.y - previous.y, avatar.z - previous.z) < 0.25
      && Math.hypot(avatar.vx - previous.vx, avatar.vy - previous.vy, avatar.vz - previous.vz) < 0.1) return;
    const payload = JSON.stringify({ type: 'state', avatar });
    this.socket.send(payload);
    this.previousState = avatar;
    this.lastSentAt = now;
  }

  public get identity(): string { return this.id; }

  public speak(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = performance.now();
    if (now - this.lastSpeechAt < speechSendInterval) return;
    this.lastSpeechAt = now;
    this.onSpeech({ id: this.id, text: trimmed, expiresAt: Date.now() + speechDuration });
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'speech', text: trimmed }));
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
      if (this.destroyed) { this.socket?.close(); return; }
      this.socket?.send(JSON.stringify({ type: 'join', id: this.id }));
      this.previousState = undefined;
      this.lastSentAt = 0;
      if (this.latest) this.publish(this.latest);
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as PresenceMessage;
      this.consume(message);
    });
    this.socket.addEventListener('error', () => undefined);
    this.socket.addEventListener('close', () => {
      if (this.destroyed) return;
      this.avatars.clear();
      this.listener(new Map());
      this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
    });
  }

  private consume(message: PresenceMessage): void {
    if (message.type === 'speech' && message.id && message.text && message.durationMs) {
      this.onSpeech({ id: message.id, text: message.text, expiresAt: Date.now() + message.durationMs });
      return;
    }
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
