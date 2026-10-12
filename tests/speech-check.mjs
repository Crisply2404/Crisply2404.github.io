import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.SITE_URL ?? 'http://localhost:5175';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const errors = [];
const recordTransitions = () => {
  window.speechTransitions = [];
  document.addEventListener('transitionend', (event) => {
    if (event.target.matches('.speech-composer .speech-panel')) {
      window.speechTransitions.push({ property: event.propertyName, duration: event.elapsedTime });
    }
  });
};
await page.addInitScript(recordTransitions);
page.on('pageerror', (error) => errors.push(error.message));
const sent = [];
page.on('websocket', (socket) => socket.on('framesent', (event) => sent.push(JSON.parse(String(event.payload)))));
await page.goto(url);
await page.waitForSelector('.scene-canvas');
await page.keyboard.press('Enter');
const input = page.getByRole('textbox', { name: 'Message' });
await input.waitFor();
await page.waitForFunction(() => document.activeElement?.classList.contains('speech-input'));
await page.waitForFunction(() => ['opacity', 'transform'].every((property) => window.speechTransitions
  .some((event) => event.property === property && event.duration >= 0.19)));
await page.evaluate(() => { window.speechTransitions = []; });
await input.fill('WASD <b>附近你好</b>');
await page.keyboard.press('Enter');
await page.waitForFunction(() => ['opacity', 'transform'].every((property) => window.speechTransitions
  .some((event) => event.property === property && event.duration >= 0.19)));
await page.waitForFunction(() => document.querySelector('.speech-composer').hidden);
await page.waitForFunction(() => [...document.querySelectorAll('.speech-anchor:not(.speech-composer) .speech-panel')]
  .some((panel) => panel.textContent === 'WASD <b>附近你好</b>'));
assert.equal(await page.locator('.speech-panel b').count(), 0, 'Messages must render as text');
assert.ok(sent.some((message) => message.type === 'speech' && message.text === 'WASD <b>附近你好</b>'));
await page.keyboard.press('Enter');
await input.waitFor();
await input.fill('cancelled');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.speech-composer').hidden);
assert.ok(!sent.some((message) => message.type === 'speech' && message.text === 'cancelled'));
await page.waitForTimeout(8500);
assert.equal(await page.locator('.speech-anchor:not(.speech-composer)').count(), 0);
await page.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobile.addInitScript(recordTransitions);
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto(`${url}/tests/game.html`);
await mobile.waitForFunction(() => window.game?.player.grounded);
const point = await mobile.evaluate(() => {
  const game = window.game;
  const position = game.player.pos.clone().project(game.camera);
  return { x: (position.x + 1) * innerWidth / 2, y: (1 - position.y) * innerHeight / 2 };
});
await mobile.touchscreen.tap(point.x, point.y);
const mobileInput = mobile.getByRole('textbox', { name: 'Message' });
await mobileInput.waitFor();
await mobile.waitForFunction(() => ['opacity', 'transform'].every((property) => window.speechTransitions
  .some((event) => event.property === property && event.duration >= 0.19)));
await mobile.evaluate(() => { window.speechTransitions = []; });
await mobileInput.fill('mobile hello');
await mobile.keyboard.press('Enter');
await mobile.waitForFunction(() => ['opacity', 'transform'].every((property) => window.speechTransitions
  .some((event) => event.property === property && event.duration >= 0.19)));
await mobile.waitForFunction(() => document.querySelector('.speech-composer').hidden);
assert.equal(await mobile.locator('.speech-anchor:not(.speech-composer) .speech-panel').textContent(), 'mobile hello');
assert.equal(await mobile.evaluate(() => window.game.path.length), 0, 'Tapping the local ball must not trigger navigation');
await mobile.close();

const sender = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const recipient = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const received = [];
let senderId;
sender.on('websocket', (socket) => socket.on('framesent', (event) => {
  const message = JSON.parse(String(event.payload));
  if (message.type === 'join') senderId = message.id;
}));
recipient.on('websocket', (socket) => socket.on('framereceived', (event) => received.push(JSON.parse(String(event.payload)))));
for (const visitor of [sender, recipient]) visitor.on('pageerror', (error) => errors.push(error.message));
await sender.goto(`${url}/tests/game.html`);
await sender.waitForFunction(() => window.game?.player.grounded);
await recipient.goto(`${url}/tests/game.html`);
await recipient.waitForFunction(() => window.game?.player.grounded);
const moveRecipient = async (z) => {
  await recipient.evaluate((z) => {
    const game = window.game;
    game.player.place(game.player.pos.clone().set(0, 40.02, z));
  }, z);
  await sender.waitForFunction((z) => [...window.game.remoteAvatars.values()].some((remote) => Math.abs(remote.target.z - z) < 0.1), z);
};
await moveRecipient(-100);
await sender.keyboard.press('Enter');
await sender.getByRole('textbox', { name: 'Message' }).fill('nearby message');
await sender.keyboard.press('Enter');
const remoteBubble = recipient.locator(`.speech-anchor[data-visitor="${senderId}"]`);
await remoteBubble.waitFor({ state: 'visible' });
assert.equal(await remoteBubble.locator('.speech-panel').textContent(), 'nearby message');
const positionError = await recipient.evaluate((id) => {
  const game = window.game;
  const object = game.remoteAvatars.get(id).object;
  const point = object.position.clone().project(game.camera);
  const anchor = document.querySelector(`.speech-anchor[data-visitor="${id}"]`);
  const radius = 20 * innerHeight * game.camera.zoom / (game.camera.top - game.camera.bottom);
  return Math.hypot(parseFloat(anchor.style.left) - (point.x + 1) * innerWidth / 2,
    parseFloat(anchor.style.top) - ((1 - point.y) * innerHeight / 2 - radius - 10));
}, senderId);
assert.ok(positionError < 0.1, 'A received bubble must stay directly above its own visitor ball');
await moveRecipient(-500);
await remoteBubble.waitFor({ state: 'hidden' });
await sender.waitForTimeout(550);
await sender.keyboard.press('Enter');
await sender.getByRole('textbox', { name: 'Message' }).fill('outside range');
await sender.keyboard.press('Enter');
await recipient.waitForTimeout(400);
assert.ok(!received.some((message) => message.type === 'speech' && message.text === 'outside range'),
  'A distant browser must not receive the message text');
await moveRecipient(-100);
await remoteBubble.waitFor({ state: 'visible' });
assert.equal(await remoteBubble.locator('.speech-panel').textContent(), 'nearby message');
await sender.close();
await remoteBubble.waitFor({ state: 'detached' });
await recipient.close();
assert.deepEqual(errors, []);
await browser.close();
console.log('真实浏览器对话检查通过：Enter、手机点击球体、补间、文本、取消、过期、附近接收、距离显示、球体跟随与离开清理。');
