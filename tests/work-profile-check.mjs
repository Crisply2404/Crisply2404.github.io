import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.SITE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  assert.equal(await page.locator('.game-header .site-title').getAttribute('href'), 'https://github.com/Crisply2404');
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  await page.waitForSelector('.page-letter');
  assert.equal(await page.getByRole('link', { name: 'GitHub profile' }).getAttribute('href'), 'https://github.com/Crisply2404');
  const github = await page.locator('.github-link').boundingBox();
  const toggle = await page.locator('.view-toggle').boundingBox();
  assert.ok(github.x + github.width < toggle.x && Math.abs(github.y - toggle.y) < 1);
  const work = page.getByRole('button', { name: 'Work', exact: true });
  assert.equal(await work.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByRole('link', { name: '击鼓传字', exact: true }).count(), 0);
  await page.mouse.move(0, 0);
  await work.evaluate((button) => {
    window.workHeights = [];
    button.addEventListener('click', () => {
      const panel = document.querySelector('.work-panel');
      const start = performance.now();
      const frame = () => {
        window.workHeights.push(panel.getBoundingClientRect().height);
        if (performance.now() - start < 450) requestAnimationFrame(frame);
      };
      frame();
    }, { once: true, capture: true });
  });
  await work.click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  const sizes = await page.evaluate(() => window.workHeights);
  assert.equal(await work.getAttribute('aria-expanded'), 'true');
  assert.ok(sizes.some((height) => height > 1 && height < sizes.at(-1) - 1), 'Work must animate its height');
  const project = page.getByRole('link', { name: '击鼓传字', exact: true });
  assert.equal(await project.getAttribute('href'), '/chuan-zi/');
  await project.focus();
  await page.waitForTimeout(500);
  const ball = await page.locator('.entrance-ball').boundingBox();
  const row = await project.boundingBox();
  assert.ok(Math.abs(ball.y + 16 - row.y - row.height / 2) < 1);
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.filter((letter) => '击鼓传字'.includes(letter.textContent)).every((letter) => !letter.hidden)));
  await page.getByRole('button', { name: 'Switch to game view' }).click();
  await page.waitForSelector('.scene-canvas');
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  await page.waitForSelector('.page-letter');
  assert.equal(await work.getAttribute('aria-expanded'), 'true', 'Mode changes must preserve the expanded project list');
  await page.waitForTimeout(420);
  await work.click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.work-panel').evaluate((panel) => panel.getBoundingClientRect().height), 0);
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.filter((letter) => '击鼓传字'.includes(letter.textContent)).every((letter) => letter.hidden)));
  assert.equal(await page.locator('.site-title').getAttribute('href'), '/');
  assert.deepEqual(errors, []);
  await page.close();
}
await browser.close();
console.log('GitHub 入口、Work 高度补间、子入口、球体跟随与文字显示检查通过。');
