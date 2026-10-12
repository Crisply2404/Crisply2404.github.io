import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const service = process.env.PRESENCE_URL ?? 'ws://localhost:8788/lobby';
const healthUrl = new URL('/health', service.replace(/^ws/, 'http'));
const origin = process.env.SITE_ORIGIN ?? 'http://localhost:5174';
const sockets = [];
const identities = new Set();

async function connect() {
  const socket = new WebSocket(service, { origin });
  const messages = [];
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  await once(socket, 'open');
  const id = randomUUID();
  identities.add(id);
  socket.send(JSON.stringify({ type: 'join', id }));
  sockets.push(socket);
  return { socket, messages, id };
}

async function until(predicate) {
  const timeout = performance.now() + 5000;
  while (!predicate()) {
    if (performance.now() >= timeout) throw new Error('Presence condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const first = await connect();
const second = await connect();
const state = { x: 15, y: 40.02, z: -100, vx: 1, vy: 0, vz: -1 };
first.socket.send(JSON.stringify({ type: 'state', avatar: state }));
await until(() => second.messages.some((message) => message.type === 'state' && message.avatar.id === first.id));
assert.deepEqual(second.messages.find((message) => message.type === 'state' && message.avatar.id === first.id).avatar,
  { id: first.id, ...state });
assert.ok(!first.messages.some((message) => message.type === 'state' && message.avatar.id === first.id));
const third = await connect();
await until(() => third.messages.some((message) => message.type === 'snapshot'));
assert.ok(third.messages.find((message) => message.type === 'snapshot').avatars.some((avatar) => avatar.id === first.id));
await new Promise((resolve) => setTimeout(resolve, 120));
const before = second.messages.filter((message) => message.type === 'state' && message.avatar.id === first.id).length;
for (let index = 0; index < 50; index += 1) first.socket.send(JSON.stringify({ type: 'state', avatar: { ...state, x: index } }));
await new Promise((resolve) => setTimeout(resolve, 200));
assert.ok(second.messages.filter((message) => message.type === 'state' && message.avatar.id === first.id).length - before <= 10,
  'Relay must limit rapid position messages');
first.socket.close();
await until(() => second.messages.some((message) => message.type === 'leave' && message.id === first.id));
const fourth = await connect();
await until(() => fourth.messages.some((message) => message.type === 'snapshot'));
assert.ok(!fourth.messages.find((message) => message.type === 'snapshot').avatars.some((avatar) => avatar.id === first.id));

const group = await Promise.all(Array.from({ length: 20 }, () => connect()));
group[0].socket.send(JSON.stringify({ type: 'state', avatar: state }));
await until(() => group.slice(1).every((peer) => peer.messages.some((message) => message.type === 'state' && message.avatar.id === group[0].id)));
await Promise.all(sockets.filter((socket) => socket.readyState === WebSocket.OPEN).map(async (socket) => {
  const closing = once(socket, 'close');
  socket.close();
  await closing;
}));
await new Promise((resolve) => setTimeout(resolve, 250));
const observer = await connect();
await until(() => observer.messages.some((message) => message.type === 'snapshot'));
assert.ok(!observer.messages.find((message) => message.type === 'snapshot').avatars.some((avatar) => identities.has(avatar.id)),
  'Closed verification connections must not remain in the lobby');
const health = await fetch(healthUrl);
assert.equal(health.status, 200);
assert.ok(Number.isInteger((await health.json()).visitors));
const observerClosed = once(observer.socket, 'close');
observer.socket.close();
await observerClosed;
assert.equal((await fetch(new URL('/lobby', healthUrl))).status, 426);
console.log('真实 Workers runtime：加入、快照、广播、发送限速、离线移除、二十个连接与临时状态清理检查通过。');
