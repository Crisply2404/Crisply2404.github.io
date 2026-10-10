import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
await fs.mkdir('.work/screenshots', { recursive: true });
page.on('response', (response) => { if (response.status() >= 400) console.log('HTTP', response.status(), response.url()); });
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://localhost:5174/tests/render.html');
await page.waitForFunction(() => typeof window.runRenderChecks === 'function');
const results = await page.evaluate(() => window.runRenderChecks());
assert.deepEqual(errors, []);
console.log(JSON.stringify({ rendering: results }));
await page.goto('http://localhost:5174/');
await page.waitForSelector('.scene-canvas');
await page.waitForFunction(() => document.querySelector('canvas')?.width > 100);
await page.screenshot({ path: '.work/screenshots/desktop.png' });
assert.equal(await page.locator('.mobile-controls').isVisible(), false);
await page.getByRole('button', { name: 'Switch to list view' }).click();
assert.equal(await page.locator('.entry-row').count(), 3);
await page.reload();
assert.equal(await page.locator('.entry-row').count(), 3);
await page.getByRole('button', { name: 'Switch to game view' }).click();
await page.waitForSelector('.scene-canvas');
assert.deepEqual(errors, []);
console.log('浏览器渲染、形态切换和选择保存检查通过。');

await page.goto('http://localhost:5174/tests/game.html');
await page.waitForFunction(() => window.game?.player.grounded);
const state = () => page.evaluate(() => {
  const game = window.game;
  return { x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, angle: game.targetCameraAngle,
    vx: game.player.vel.x, vz: game.player.vel.z, grounded: game.player.grounded, path: game.path.length };
});
await page.keyboard.down('w');
await page.waitForFunction(() => window.game.player.pos.x < -25);
await page.keyboard.press('q');
assert.equal((await state()).angle, Math.PI * 3 / 4);
await page.waitForFunction(() => window.game.player.pos.x < -55);
assert.ok(Math.abs((await state()).vz) < 0.02);
await page.keyboard.up('w'); await page.keyboard.press('r');
await page.waitForFunction(() => window.game.player.grounded);
await page.keyboard.down(' ');
await page.waitForFunction(() => window.game.player.pos.y > 100);
await page.keyboard.up(' ');
await page.waitForFunction(() => window.game.player.grounded);
assert.ok(Math.abs((await state()).y - 40.01) < 0.1);

const clickWorld = async (x, z) => {
  const projected = await page.evaluate(({ x, z }) => {
    const game = window.game;
    const point = game.player.pos.clone().set(x, 20, z).project(game.camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, { x, z });
  await page.mouse.click(projected.x, projected.y);
};
await clickWorld(0, -100);
await page.waitForFunction(() => window.game.path.length === 0 && Math.abs(window.game.player.pos.z + 100) < 5);
const safe = await state();
await clickWorld(200, -100);
assert.equal((await state()).path, 0);
assert.ok(Math.abs((await state()).z - safe.z) < 1);
await clickWorld(-80, -160);
await page.waitForFunction(() => window.routes.includes('/notes/'), undefined, { polling: 100 });
assert.ok(await page.evaluate(() => window.routes.includes('/notes/')), JSON.stringify(await page.evaluate(() => ({
  position: window.game.player.pos.toArray(),
  path: window.game.path.map((point) => point.position.toArray()),
  grounded: window.game.player.grounded,
  routes: window.routes,
}))));
await page.waitForTimeout(100);
assert.deepEqual(await page.evaluate(() => window.routes), ['/notes/']);
await page.keyboard.press('Tab');
assert.equal(await page.locator('.control-preview').isVisible(), true);
assert.deepEqual(errors, []);
console.log('真实键盘移动、镜头旋转、跳跃、鼠标寻路和自动进入门检查通过。');

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto('http://localhost:5174/tests/game.html');
await mobile.waitForFunction(() => window.game?.player.grounded);
assert.equal(await mobile.evaluate(() => innerWidth), 390);
assert.equal(await mobile.locator('.mobile-controls').isVisible(), true);
await mobile.screenshot({ path: '.work/screenshots/mobile.png' });
const rectangles = await mobile.locator('.touch-button').evaluateAll((buttons) => buttons.map((button) => {
  const rect = button.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}));
for (const rect of rectangles) {
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 390 && rect.y + rect.height <= 844);
}
const dpad = await mobile.locator('.dpad').boundingBox();
const jump = await mobile.getByRole('button', { name: 'jump', exact: true }).boundingBox();
assert.ok(dpad && jump);
const cdp = await mobile.context().newCDPSession(mobile);
const touches = [
  { id: 0, x: dpad.x + dpad.width / 2, y: dpad.y + 5 },
  { id: 1, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 },
];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
await mobile.waitForFunction(() => window.game.player.pos.y > 65 && window.game.player.pos.x < -5);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touches[0], x: dpad.x + dpad.width - 5, y: dpad.y + dpad.height / 2 }, touches[1]] });
await mobile.waitForFunction(() => window.game.touchKeys.has('right') && !window.game.touchKeys.has('up'));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touches[0], x: dpad.x + 5, y: dpad.y + 5 }, touches[1]] });
await mobile.waitForFunction(() => window.game.touchKeys.has('left') && window.game.touchKeys.has('up'));
assert.equal(await mobile.locator('.dpad .is-active').count(), 1);
assert.equal(await mobile.locator('.dpad [data-action="up-left"]').getAttribute('class'), 'touch-button is-active');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mobile.waitForFunction(() => window.game.touchKeys.size === 0 && !window.game.jumpPressed);
assert.deepEqual(errors, []);
console.log('手机双指移动与跳跃、滑动切换和输入释放检查通过。');
for (const deviceScaleFactor of [2, 3]) {
  const dense = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor });
  dense.on('pageerror', (error) => errors.push(error.message));
  await dense.goto('http://localhost:5174/tests/render.html');
  await dense.waitForFunction(() => typeof window.runRenderChecks === 'function');
  const results = await dense.evaluate(() => window.runRenderChecks());
  console.log(JSON.stringify({ deviceScaleFactor, rendering: results }));
  await dense.close();
}
assert.deepEqual(errors, []);
await browser.close();
