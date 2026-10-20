import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const url = process.env.SITE_URL ?? 'http://localhost:5175';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const first = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const second = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const received = [];
  second.on('websocket', (socket) => socket.on('framereceived', (event) => received.push(JSON.parse(String(event.payload)))));
  for (const [index, page] of [first, second].entries()) {
    await page.goto(`${url}/tests/game.html`);
    await page.waitForFunction(() => window.game?.presence.socket?.readyState === WebSocket.OPEN);
    await page.evaluate((index) => {
      const game = window.game;
      game.setBlivet(true); game.player.place(game.player.pos.clone().set(index ? 240 : 160, 80.02, -80));
      game.targetCameraAngle = index ? Math.PI * 5 / 4 : Math.PI / 4;
      if (game.physics.sphere.radius !== 20 || game.blivet.physics.sphere.radius !== 20) throw new Error('Player hitbox changed');
    }, index);
  }
  const identity = await first.evaluate(() => window.game.presence.identity);
  const secondIdentity = await second.evaluate(() => window.game.presence.identity);
  await first.waitForFunction((identity) => window.game.remoteAvatars.get(identity)?.target.space === 'blivet', secondIdentity);
  await second.waitForFunction((identity) => window.game.remoteAvatars.get(identity)?.target.space === 'blivet', identity);
  await second.waitForFunction((identity) => {
    const game = window.game, remote = game.remoteAvatars.get(identity);
    return remote && remote.target.x > 1150 && remote.position.distanceTo(game.remotePosition(remote.target)) < 0.1;
  }, identity);
  const distance = await second.evaluate((identity) => {
    const game = window.game, remote = game.remoteAvatars.get(identity);
    return remote.object.position.distanceTo(game.blivet.renderPosition(remote.position, game.cameraAngle));
  }, identity);
  assert.ok(distance < 0.01, 'Remote ball did not use the observing browser spatial chart');
  await first.keyboard.press('Enter');
  await first.getByRole('textbox', { name: 'Message' }).fill('Playground connection');
  await first.waitForFunction(() => document.activeElement?.classList.contains('speech-input'));
  await first.keyboard.press('Enter');
  await first.getByText('Playground connection', { exact: true }).waitFor();
  await expect.poll(() => received.some((message) => message.type === 'speech' && message.id === identity), { timeout: 10000 }).toBeTruthy();
  await second.getByText('Playground connection', { exact: true }).waitFor({ timeout: 5000 });
  await first.close();
  await second.waitForFunction((identity) => !window.game.remoteAvatars.has(identity), identity);
  await second.close();
  console.log('两个真实浏览器：Blivet 空间广播、不同镜头下的访客位置、20 单位球体 hitbox、附近对话和离开移除检查通过。');
} finally {
  await browser.close();
}
