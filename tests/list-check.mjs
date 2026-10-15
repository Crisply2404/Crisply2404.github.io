import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const errors = [];
const baseUrl = process.env.SITE_URL ?? 'http://localhost:5174';

const scenarios = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 240 }]
  .flatMap((viewport) => ['no-preference', 'reduce'].map((reducedMotion) => ({ viewport, reducedMotion })));

for (const { viewport, reducedMotion } of scenarios) {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  const entrances = page.getByRole('navigation', { name: 'Site entrances' });
  const rows = entrances.locator(':scope > .entry-row');
  const ball = entrances.locator('.entrance-ball');
  await ball.waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), reducedMotion === 'reduce');
  assert.equal(await ball.evaluate((canvas) => getComputedStyle(canvas).transitionDuration), '0.42s');
  assert.deepEqual(await rows.allTextContents().then((titles) => titles.map((title) => title.trim())), ['Notes', 'Essays', 'Work']);
  assert.deepEqual(await rows.evaluateAll((links) => links.map((link) => link.getAttribute('href'))), ['/notes/', '/essays/', null]);
  assert.equal(await entrances.locator('.entry-index, .entry-path').count(), 0);
  await entrances.evaluate((nav) => {
    if (getComputedStyle(nav).borderTopWidth !== '0px') throw new Error('Entrance list has a divider');
    for (const row of nav.querySelectorAll('a')) {
      const style = getComputedStyle(row);
      if (style.borderBottomWidth !== '0px') throw new Error('Entrance row has a divider');
      if (row.scrollWidth > row.clientWidth) throw new Error('Entrance title overflows');
    }
  });

  await page.mouse.move(0, 0);
  const firstBall = await ball.boundingBox();
  const dark = PNG.sync.read(await page.screenshot({ type: 'png', clip: firstBall }));
  assert.equal(dark.width, 32);
  const center = (16 * dark.width + 16) * 4;
  assert.equal(dark.data[center], 0);
  const ring = (16 * dark.width + 4) * 4;
  assert.ok(dark.data[ring] > 180, 'Game ball outline must be visible');
  await rows.nth(0).hover();
  await page.waitForTimeout(250);
  const secondBall = await ball.boundingBox();
  const light = PNG.sync.read(await page.screenshot({ type: 'png', clip: secondBall }));
  assert.equal(light.data[center], 255);
  assert.ok(light.data[ring] < 75, 'Game ball outline must invert with the entrance');
  for (let offset = 0; offset < dark.data.length; offset += 4) {
    assert.ok(Math.abs(dark.data[offset] + light.data[offset] - 255) <= 1, 'Ball pixels must invert naturally on the white row');
  }

  await page.mouse.move(0, 0);
  await rows.nth(2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const target = await rows.nth(2).boundingBox();
  await page.mouse.move(viewport.width - 1, 0);
  const start = await ball.boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  const samples = await page.evaluate(async () => {
    const canvas = document.querySelector('.entrance-ball');
    const started = performance.now();
    const samples = [];
    await new Promise((resolve) => {
      const measure = (now) => {
        samples.push({ time: now - started, y: canvas.getBoundingClientRect().y });
        if (now - started > 550) resolve();
        else requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    });
    return samples;
  });
  const final = await ball.boundingBox();
  assert.ok(Math.abs(final.y + final.height / 2 - target.y - target.height / 2) < 0.5, 'Ball must settle before the hovered title');
  assert.ok(samples.some((sample) => sample.y > start.y + 1 && sample.y < final.y - 1), `Ball must show intermediate positions throughout the animation: ${JSON.stringify({ start, final, samples })}`);
  const halfway = samples.find((sample) => sample.time >= 130);
  assert.ok((halfway.y - start.y) / (final.y - start.y) > 0.7, 'Ball must cover most distance early');
  assert.ok(samples.every((sample, index) => index === 0 || sample.y >= samples[index - 1].y - 0.5), 'Ball must move directly toward the selected title');

  await rows.nth(0).focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const focused = await rows.nth(1).boundingBox();
  const focusBall = await ball.boundingBox();
  assert.ok(Math.abs(focusBall.y + focusBall.height / 2 - focused.y - focused.height / 2) < 0.5, `Keyboard focus must move the ball: ${JSON.stringify({ focusBall, focused })}`);
  assert.equal(await rows.nth(1).evaluate((row) => getComputedStyle(row).backgroundColor), 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Switch to game view' }).click();
  await page.waitForSelector('.scene-canvas');
  assert.equal(await page.locator('.entrance-ball').count(), 0);
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  await page.waitForSelector('.entrance-ball');
  assert.equal(await page.locator('.entrance-ball').count(), 1);
  await page.reload();
  await page.waitForSelector('.entrance-ball');
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await page.waitForURL(`${baseUrl}/notes/`);
  await page.goBack();
  await page.waitForSelector('.entrance-ball');
  assert.equal(await page.locator('.entrance-ball').count(), 1);
  console.log(`入口列表、原游戏球体、反色、减速移动、键盘与页面返回检查通过：${viewport.width} × ${viewport.height}，reducedMotion=${reducedMotion}`);
  await page.close();
}

assert.deepEqual(errors, []);
await browser.close();
