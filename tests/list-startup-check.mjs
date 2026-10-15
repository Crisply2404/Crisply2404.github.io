import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const url = process.env.SITE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const errors = [];
for (let attempt = 0; attempt < 6; attempt += 1) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('crisply2404-home-mode', 'list'));
  await page.mouse.move(800, 400);
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForSelector('.entrance-ball');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => !document.querySelector('.game-cursor').hidden
    || getComputedStyle(document.body).cursor !== 'none'), 'A stationary pointer must remain visible after navigation');
  await page.waitForSelector('.entrance-list');
  await page.mouse.move(1100, 600);
  await page.waitForSelector('.entrance-ball');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.game-cursor').isVisible(), 'A pointer moved during startup must appear after loading');
  const pixels = PNG.sync.read(await page.locator('.entrance-ball').screenshot());
  assert.ok(pixels.data.some((value, index) => index % 4 === 0 && value > 180), 'Direct list entry must render the ball');
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('.entrance-ball');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => !document.querySelector('.game-cursor').hidden
    || getComputedStyle(document.body).cursor !== 'none'), 'A stationary pointer must remain visible after refresh');
  await page.mouse.move(1000, 620);
  assert.ok(await page.locator('.game-cursor').isVisible());
  await context.close();
}
assert.deepEqual(errors, []);
await browser.close();
console.log('保存网页形态后直接进入、加载期间移动光标和刷新检查通过。');
