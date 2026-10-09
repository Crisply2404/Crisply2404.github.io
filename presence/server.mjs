import http from 'node:http';
import process from 'node:process';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '0.0.0.0';
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5174,http://127.0.0.1:5174,http://127.0.0.1:5175,https://crisply2404.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const avatars = new Map();

const httpServer = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', visitors: avatars.size }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const websocketServer = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    websocketServer.emit('connection', client, request);
  });
});

function send(client, message) {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function broadcast(message, excluded) {
  for (const client of websocketServer.clients) {
    if (client !== excluded) send(client, message);
  }
}

websocketServer.on('connection', (client) => {
  let id;
  send(client, {
    type: 'snapshot',
    avatars: [...avatars.values()],
  });

  client.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'join') {
      id = String(message.id);
      return;
    }
    if (message.type !== 'state' || !id || !message.avatar) return;
    const avatar = {
      id,
      x: Number(message.avatar.x),
      y: Number(message.avatar.y),
      z: Number(message.avatar.z),
      vx: Number(message.avatar.vx),
      vy: Number(message.avatar.vy),
      vz: Number(message.avatar.vz),
    };
    avatars.set(id, avatar);
    broadcast({ type: 'state', avatar }, client);
  });

  client.on('close', () => {
    if (!id) return;
    avatars.delete(id);
    broadcast({ type: 'leave', id });
  });
});

httpServer.listen(port, host);
