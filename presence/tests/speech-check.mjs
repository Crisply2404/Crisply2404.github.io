import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const url = process.env.PRESENCE_URL ?? 'ws://localhost:8788/lobby';
const origin = process.env.SITE_ORIGIN ?? 'http://localhost:5174';
const peers = [];

async function connect(x) {
  const socket = new WebSocket(url, { origin });
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  await once(socket, 'open');
  const id = randomUUID();
  socket.send(JSON.stringify({ type: 'join', id }));
  socket.send(JSON.stringify({ type: 'state', avatar: { x, y: 40, z: 0, vx: 0, vy: 0, vz: 0 } }));
  const peer = { socket, id, messages };
  peers.push(peer);
  return peer;
}

async function waitFor(predicate) {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Speech relay condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const sender = await connect(0);
const near = await connect(200);
const far = await connect(300);
await waitFor(() => sender.messages.some((message) => message.type === 'state' && message.avatar.id === far.id));
sender.socket.send(JSON.stringify({ type: 'speech', text: '<b>hello nearby</b>' }));
await waitFor(() => near.messages.some((message) => message.type === 'speech'));
const speech = near.messages.find((message) => message.type === 'speech');
assert.equal(speech.id, sender.id);
assert.equal(speech.text, '<b>hello nearby</b>');
assert.equal(speech.durationMs, 8000);
await new Promise((resolve) => setTimeout(resolve, 200));
assert.ok(!far.messages.some((message) => message.type === 'speech'), 'Distant visitors must never receive the message');
const newcomer = await connect(100);
await waitFor(() => newcomer.messages.some((message) => message.type === 'snapshot'));
assert.ok(!newcomer.messages.some((message) => message.type === 'speech'), 'New visitors must not receive conversation history');
far.socket.send(JSON.stringify({ type: 'state', avatar: { x: 100, y: 40, z: 0, vx: 0, vy: 0, vz: 0 } }));
await waitFor(() => sender.messages.filter((message) => message.type === 'state' && message.avatar.id === far.id).at(-1)?.avatar.x === 100);
await new Promise((resolve) => setTimeout(resolve, 500));
sender.socket.send(JSON.stringify({ type: 'speech', text: 'second message' }));
await waitFor(() => far.messages.some((message) => message.type === 'speech' && message.text === 'second message'));
await Promise.all(peers.map(async ({ socket }) => {
  const closing = once(socket, 'close');
  socket.close();
  await closing;
}));
console.log('真实 WebSocket 对话检查通过：附近接收、远处不接收、不保存历史与移动后的距离判定。');
