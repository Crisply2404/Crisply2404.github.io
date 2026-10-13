import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const baseUrl = process.env.SITE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(baseUrl);
await page.getByRole('button', { name: 'Switch to list view' }).click();
const ball = page.locator('.entrance-ball');
await ball.waitFor();
await page.waitForTimeout(500);
await page.mouse.move(1100, 400);
assert.equal(await page.locator('body').evaluate((body) => getComputedStyle(body).cursor), 'none');
assert.equal(await page.getByRole('link', { name: 'Notes', exact: true }).evaluate((link) => getComputedStyle(link).cursor), 'none');
assert.ok(await page.locator('.game-cursor').isVisible());
const before = await ball.boundingBox();
await page.keyboard.down('d');
await page.waitForTimeout(350);
await page.keyboard.up('d');
const moved = await ball.boundingBox();
assert.ok(moved.x > before.x + 20, 'WASD must move the entrance ball');
await page.waitForTimeout(700);
const beforeRotation = await ball.boundingBox();
const beforeCursorRotation = await page.locator('.game-cursor').boundingBox();
const cursorBefore = PNG.sync.read(await page.locator('.game-cursor').screenshot());
await page.keyboard.press('q');
await page.waitForTimeout(80);
const cursorAfter = PNG.sync.read(await page.locator('.game-cursor').screenshot());
assert.notDeepEqual(cursorBefore.data, cursorAfter.data, 'Q must rotate the game cursor view');
const duringRotation = await ball.boundingBox();
const duringCursorRotation = await page.locator('.game-cursor').boundingBox();
assert.ok(Math.hypot(duringCursorRotation.x - beforeCursorRotation.x, duringCursorRotation.y - beforeCursorRotation.y) < 0.5,
  'The rotating cursor must preserve its own screen center');
assert.ok(Math.hypot(duringRotation.x - beforeRotation.x, duringRotation.y - beforeRotation.y) < 0.5,
  `Rotating the view must preserve the moved ball center: ${JSON.stringify({ beforeRotation, duringRotation })}`);
await page.waitForTimeout(500);
const afterRotation = await ball.boundingBox();
assert.ok(Math.hypot(afterRotation.x - beforeRotation.x, afterRotation.y - beforeRotation.y) < 0.5,
  'Rotation must finish with every element at its own center');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);

await page.getByRole('link', { name: 'Essays', exact: true }).hover();
await page.waitForTimeout(500);
const essay = await page.getByRole('link', { name: 'Essays', exact: true }).boundingBox();
const restored = await ball.boundingBox();
assert.ok(Math.abs(restored.y + 16 - essay.y - essay.height / 2) < 0.5);
assert.ok(Math.abs(restored.x - before.x) < 0.5, 'Hover must restore the entrance anchor after keyboard play');

await page.mouse.move(1100, 400);
const darkCursorBounds = await page.locator('.game-cursor').boundingBox();
const darkCursor = PNG.sync.read(await page.screenshot({ clip: darkCursorBounds }));
await page.mouse.move(essay.x + essay.width / 2, essay.y + essay.height - 20);
await page.waitForTimeout(200);
const mixedCursorBounds = await page.locator('.game-cursor').boundingBox();
const mixedCursor = PNG.sync.read(await page.screenshot({ clip: mixedCursorBounds }));
assert.equal(mixedCursor.width, darkCursor.width);
assert.equal(mixedCursor.height, darkCursor.height);
let invertedStrokes = 0;
let unchangedStrokes = 0;
for (let y = 0; y < mixedCursor.height; y += 1) {
  const screenY = Math.floor(mixedCursorBounds.y) + y;
  if (Math.abs(screenY - essay.y - essay.height) < 2) continue;
  for (let x = 0; x < mixedCursor.width; x += 1) {
    const index = (y * mixedCursor.width + x) * 4;
    const dark = darkCursor.data[index];
    const mixed = mixedCursor.data[index];
    if (screenY >= essay.y && screenY < essay.y + essay.height) {
      assert.ok(Math.abs(dark + mixed - 255) <= 1, 'Cursor pixels must invert only within the highlighted row');
      if (dark > 100) invertedStrokes += 1;
    } else {
      assert.ok(Math.abs(dark - mixed) <= 1, 'Cursor pixels over black must preserve their appearance');
      if (dark > 100) unchangedStrokes += 1;
    }
  }
}
assert.ok(invertedStrokes > 10 && unchangedStrokes > 10, 'The same cursor must span inverted and normal regions');

const center = { x: restored.x + 16, y: restored.y + 16 };
await page.mouse.move(center.x + 100, center.y - 100);
await page.mouse.move(center.x, center.y);
await page.waitForFunction(() => document.querySelector('.entrance-ball').classList.contains('is-broken'));
await page.waitForTimeout(320);
assert.ok(await ball.evaluate((canvas) => canvas.classList.contains('is-broken')), 'Ball must wait while the spike remains in contact');
await page.mouse.move(1100, 400);
await page.waitForFunction(() => !document.querySelector('.entrance-ball').classList.contains('is-broken'));
await page.waitForTimeout(500);
const reborn = await ball.boundingBox();
assert.ok(Math.abs(reborn.y + 16 - essay.y - essay.height / 2) < 0.5, 'Ball must respawn before the nearest title');

const fractureImages = [];
for (let attempt = 0; attempt < 3; attempt += 1) {
  const current = await ball.boundingBox();
  await page.mouse.move(current.x + 116, current.y - 84);
  await page.mouse.move(current.x + 16, current.y + 16);
  await page.waitForFunction(() => document.querySelector('.entrance-ball').classList.contains('is-broken'));
  await page.waitForTimeout(70);
  fractureImages.push(PNG.sync.read(await ball.screenshot()).data);
  await page.mouse.move(1100, 400);
  await page.waitForFunction(() => !document.querySelector('.entrance-ball').classList.contains('is-broken'));
  await page.waitForTimeout(450);
}
for (let attempt = 1; attempt < fractureImages.length; attempt += 1) {
  assert.notDeepEqual(fractureImages[attempt], fractureImages[attempt - 1], 'Every fracture must produce different random arcs');
}

const pushCenter = { x: reborn.x + 16, y: reborn.y + 16 };
await page.mouse.move(1100, 0);
await page.mouse.move(pushCenter.x - 100, 0);
await page.mouse.move(pushCenter.x - 100, pushCenter.y - 40);
await page.mouse.move(pushCenter.x - 24, pushCenter.y - 42);
await page.waitForTimeout(80);
const pushed = await ball.boundingBox();
assert.ok(Math.hypot(pushed.x - reborn.x, pushed.y - reborn.y) > 1, 'Cursor block must push the ball');
assert.equal(await ball.evaluate((canvas) => canvas.classList.contains('is-broken')), false);
await page.mouse.move(1100, 400);
await page.waitForTimeout(500);
const afterPush = await ball.boundingBox();
assert.ok(Math.abs(afterPush.x - pushed.x) < 0.5, 'Ball must retain its position after the cursor block moves away');
await page.getByRole('link', { name: 'Essays', exact: true }).hover();
await page.waitForTimeout(500);
const sameSelection = await ball.boundingBox();
assert.ok(Math.abs(sameSelection.x - pushed.x) < 0.5, 'Hovering the same entrance must preserve a pushed ball');
await page.getByRole('link', { name: 'Notes', exact: true }).hover();
await page.waitForTimeout(500);
const changedSelection = await ball.boundingBox();
assert.ok(Math.abs(changedSelection.x - before.x) < 0.5, 'Changing entrance selection must return the ball to its title');
await page.keyboard.down('a');
await page.waitForTimeout(400);
await page.keyboard.up('a');
await page.waitForTimeout(700);
await page.keyboard.down('s');
await page.waitForTimeout(450);
await page.keyboard.up('s');
await page.waitForTimeout(700);
const outside = await ball.boundingBox();
const outsideCenter = { x: outside.x + 16, y: outside.y + 16 };
await page.mouse.move(1200, 0);
await page.mouse.move(outsideCenter.x - 100, 0);
await page.mouse.move(outsideCenter.x - 100, outsideCenter.y - 42);
await page.mouse.move(outsideCenter.x - 24, outsideCenter.y - 42);
await page.waitForTimeout(80);
const outsidePush = await ball.boundingBox();
assert.ok(Math.hypot(outsidePush.x - outside.x, outsidePush.y - outside.y) > 1, 'The cursor block must push a ball outside the highlighted row');
assert.ok(Math.abs(outsidePush.x - before.x) > 20, 'A block collision must preserve the existing keyboard displacement');
await page.mouse.move(outsideCenter.x - 100, outsideCenter.y - 42);
await page.mouse.move(outsideCenter.x - 100, 0);
await page.mouse.move(1200, 0);
await page.waitForTimeout(500);
const outsideAfterLeave = await ball.boundingBox();
assert.ok(Math.hypot(outsideAfterLeave.x - outsidePush.x, outsideAfterLeave.y - outsidePush.y) < 0.5,
  'Leaving block contact outside a highlighted row must preserve the pushed position');
await page.getByRole('button', { name: 'Switch to game view' }).click();
await page.waitForSelector('.scene-canvas');
assert.equal(await page.locator('.game-cursor').count(), 0);
assert.notEqual(await page.locator('body').evaluate((body) => getComputedStyle(body).cursor), 'none');
assert.deepEqual(errors, []);
await browser.close();
console.log('网页隐藏操作、原游戏光标、旋转、尖刺破碎、方块推动、重生与资源释放检查通过。');
