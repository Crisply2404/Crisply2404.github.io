import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const errors = [];
const baseUrl = process.env.SITE_URL ?? 'http://localhost:5174';
const lobbyHealth = process.env.PRESENCE_HEALTH_URL ?? 'http://localhost:8788/health';
const first = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const second = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const page of [first, second]) page.on('pageerror', (error) => errors.push(error.message));
const states = [];
const received = [];
let firstId;
first.on('websocket', (socket) => {
  socket.on('framesent', (event) => {
    const message = JSON.parse(String(event.payload));
    if (message.type === 'state') states.push({ time: performance.now(), avatar: message.avatar });
    if (message.type === 'join') firstId = message.id;
  });
});
second.on('websocket', (socket) => {
  socket.on('framereceived', (event) => received.push(JSON.parse(String(event.payload))));
});
await first.goto(baseUrl);
await first.waitForSelector('.scene-canvas');
await first.waitForTimeout(1500);
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 1);
const settled = states.length;
await first.waitForTimeout(400);
assert.equal(states.length, settled, `Stationary ball must stop sending repeated positions: ${JSON.stringify(states.slice(-8))}`);
await second.goto(baseUrl);
await second.waitForSelector('.scene-canvas');
await first.waitForTimeout(500);
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 2);
assert.ok(received.some((message) => message.type === 'snapshot' && message.avatars.some((avatar) => avatar.id === firstId)),
  'The second browser must receive the first visitor in its lobby snapshot');
const motionStarted = performance.now();
const motionCount = states.length;
await first.keyboard.down('s');
await first.waitForTimeout(350);
await first.keyboard.up('s');
await first.waitForTimeout(900);
assert.ok(states.length > settled, 'Moving ball must send current positions');
const latest = states.at(-1).avatar;
const remote = received.filter((message) => message.type === 'state' && message.avatar.id === firstId).at(-1)?.avatar;
assert.ok(remote, 'The second browser must receive the moving visitor');
assert.deepEqual(remote, { id: firstId, ...latest }, 'The relay must deliver the latest position to the other browser');
assert.ok(states.length - motionCount <= Math.ceil((performance.now() - motionStarted) / 100) + 1,
  'Position updates must be limited to 10 Hz');
await first.getByRole('button', { name: 'Switch to list view' }).click();
await first.waitForSelector('.entrance-ball');
await first.waitForTimeout(200);
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 1);
assert.ok(received.some((message) => message.type === 'leave' && message.id === firstId),
  'The second browser must remove a visitor who switches to list view');
const beforeList = states.length;
await first.waitForTimeout(350);
assert.equal(states.length, beforeList, 'List view must leave the lobby');
await first.getByRole('button', { name: 'Switch to game view' }).click();
await first.waitForSelector('.scene-canvas');
await first.waitForTimeout(400);
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 2);
await second.goto(`${baseUrl}/notes/`);
await first.waitForTimeout(200);
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 1);
await first.close();
await second.close();
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal((await fetch(lobbyHealth).then((response) => response.json())).visitors, 0);
assert.deepEqual(errors, []);
await browser.close();
console.log('两个真实浏览器的加入、移动同步、10 Hz 上报、静止停发、网页形态离开与重新加入检查通过。');
