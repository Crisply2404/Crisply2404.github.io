import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

interface Env {
  LOBBY: DurableObjectNamespace<PresenceLobby>;
  ALLOWED_ORIGINS: string;
}

const position = z.number().min(-100000).max(100000);
const velocity = z.number().min(-100).max(100);
const stateSchema = z.object({
  type: z.literal('state'),
  avatar: z.object({ x: position, y: position, z: position, vx: velocity, vy: velocity, vz: velocity }),
});
const joinSchema = z.object({ type: z.literal('join'), id: z.uuid() });
const messageSchema = z.discriminatedUnion('type', [stateSchema, joinSchema]);
type Avatar = z.infer<typeof stateSchema>['avatar'] & { id: string };
interface Connection { id?: string; avatar?: Avatar; tokens: number; tokenUpdatedAt: number; closed: boolean }

export class PresenceLobby extends DurableObject<Env> {
  public fetch(request: Request): Response {
    if (new URL(request.url).pathname === '/health') {
      return Response.json({ status: 'ok', visitors: this.avatars().length });
    }
    if (this.ctx.getWebSockets().length >= 100) return new Response('Lobby is full', { status: 503 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ tokens: 10, tokenUpdatedAt: Date.now(), closed: false } satisfies Connection);
    pair[1].send(JSON.stringify({ type: 'snapshot', avatars: this.avatars() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  public webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string' || raw.length > 2048) {
      socket.close(1009, 'Message exceeds the limit');
      return;
    }
    const message = messageSchema.parse(JSON.parse(raw));
    const connection = socket.deserializeAttachment() as Connection;
    if (connection.closed) return;
    if (message.type === 'join') {
      if (connection.id) throw new Error('Connection has already joined');
      if (this.ctx.getWebSockets().some((peer) => peer !== socket && (peer.deserializeAttachment() as Connection).id === message.id)) {
        socket.close(1008, 'Visitor identity is already connected');
        return;
      }
      connection.id = message.id;
      socket.serializeAttachment(connection);
      return;
    }
    if (!connection.id) throw new Error('Visitor must join before publishing');
    const now = Date.now();
    connection.tokens = Math.min(10, connection.tokens + (now - connection.tokenUpdatedAt) / 100);
    connection.tokenUpdatedAt = now;
    if (connection.tokens < 1) {
      this.remove(socket);
      socket.close(1008, 'Position update rate exceeds the limit');
      return;
    }
    connection.tokens -= 1;
    connection.avatar = { id: connection.id, ...message.avatar };
    socket.serializeAttachment(connection);
    this.broadcast({ type: 'state', avatar: connection.avatar }, socket);
  }

  public webSocketClose(socket: WebSocket): void { this.remove(socket); }
  public webSocketError(socket: WebSocket): void { this.remove(socket); }

  private avatars(): Avatar[] {
    return this.ctx.getWebSockets().flatMap((socket) => {
      const connection = socket.deserializeAttachment() as Connection;
      return connection.avatar && !connection.closed ? [connection.avatar] : [];
    });
  }

  private remove(socket: WebSocket): void {
    const connection = socket.deserializeAttachment() as Connection;
    if (connection.closed) return;
    connection.closed = true;
    socket.serializeAttachment(connection);
    if (connection.id) this.broadcast({ type: 'leave', id: connection.id }, socket);
  }

  private broadcast(message: object, excluded: WebSocket): void {
    const text = JSON.stringify(message);
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== excluded && peer.readyState === WebSocket.OPEN) peer.send(text);
    }
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    if (path === '/health') return env.LOBBY.getByName('public-lobby').fetch(request);
    if (path !== '/lobby') return new Response(null, { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 426 });
    const origins = env.ALLOWED_ORIGINS.split(',');
    if (!origins.includes(request.headers.get('Origin') ?? '')) return new Response(null, { status: 403 });
    return env.LOBBY.getByName('public-lobby').fetch(request);
  },
} satisfies ExportedHandler<Env>;
