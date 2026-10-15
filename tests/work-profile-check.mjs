import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const url = process.env.SITE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const mobile = viewport.width < 720;
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce', hasTouch: mobile,
    isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
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
        window.workHeights.push({ panel: panel.getBoundingClientRect().height,
          guide: document.querySelector('.work-guide').getBoundingClientRect().height });
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
  assert.ok(sizes.some(({ panel }) => panel > 1 && panel < sizes.at(-1).panel - 1), 'Work must animate its height');
  assert.ok(sizes.some(({ guide }) => guide > 1 && guide < sizes.at(-1).guide - 1), 'The guide must extend with the panel');
  const project = page.getByRole('link', { name: '击鼓传字', exact: true });
  assert.equal(await project.getAttribute('href'), '/chuan-zi/');
  await work.focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const ball = await page.locator('.entrance-ball').boundingBox();
  const row = await project.boundingBox();
  assert.ok(Math.abs(ball.y + 16 - row.y - row.height / 2) < 1);
  const guide = page.locator('.work-guide');
  const line = await guide.boundingBox();
  const workBounds = await work.boundingBox();
  assert.ok(Math.abs(line.x + line.width / 2 - ball.x - ball.width / 2) < 0.01, 'The guide and ball must share the same center axis');
  assert.ok(Math.abs(line.y - workBounds.y - workBounds.height / 2) < 0.01);
  assert.ok(Math.abs(line.y + line.height - row.y - row.height / 2) < 0.01);
  const typography = await page.locator('.entry-title').evaluateAll((titles) => titles.map((title) => {
    const style = getComputedStyle(title);
    return { x: title.getBoundingClientRect().x, font: style.font, spacing: style.letterSpacing,
      height: title.closest('.entry-row').getBoundingClientRect().height };
  }));
  assert.ok(typography.every((item) => JSON.stringify(item) === JSON.stringify(typography[0])), 'All entry titles must keep the same type, height and starting position');
  const clip = { x: Math.floor(ball.x + ball.width / 2) - 1, y: Math.floor(ball.y + ball.height / 2) - 3, width: 3, height: 6 };
  assert.equal(await project.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
  const covered = PNG.sync.read(await page.screenshot({ clip }));
  await page.locator('.entrance-ball').evaluate((element) => { element.style.visibility = 'hidden'; });
  const uncovered = PNG.sync.read(await page.screenshot({ clip }));
  await page.locator('.entrance-ball').evaluate((element) => { element.style.visibility = ''; });
  assert.ok(covered.data.every((value, index) => index % 4 === 3 || value === 255), 'The ball must fully hide the guide inside its highlighted interior');
  assert.ok(uncovered.data.some((value, index) => index % 4 === 0 && value < 220), 'The same pixels must contain the real guide when the ball is hidden');
  await page.getByRole('link', { name: 'Notes', exact: true }).focus();
  await page.waitForTimeout(500);
  const unhighlightedLine = PNG.sync.read(await page.screenshot({ clip }));
  assert.ok(unhighlightedLine.data.some((value, index) => index % 4 === 0 && value > 80), 'The uncovered guide must remain visible over the black row');
  await work.focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const size = viewport.width > 720 ? '64px' : '50px';
  await page.locator('.entrance-list').evaluate((element, size) => element.style.setProperty('--entrance-gutter', size), size);
  await page.waitForTimeout(200);
  const axis = await guide.boundingBox();
  const shiftedBall = await page.locator('.entrance-ball').boundingBox();
  assert.ok(Math.abs(axis.x + axis.width / 2 - shiftedBall.x - shiftedBall.width / 2) < 0.01,
    'Changing the shared gutter must preserve the guide and ball center axis');
  await page.locator('.entrance-list').evaluate((element) => element.style.removeProperty('--entrance-gutter'));
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
  assert.equal(await guide.evaluate((element) => getComputedStyle(element).opacity), '0');
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.filter((letter) => '击鼓传字'.includes(letter.textContent)).every((letter) => letter.hidden)));
  assert.equal(await page.locator('.site-title').getAttribute('href'), '/');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ viewport, axisError: Math.abs(line.x + line.width / 2 - ball.x - ball.width / 2),
    resizedAxisError: Math.abs(axis.x + axis.width / 2 - shiftedBall.x - shiftedBall.width / 2) }));
  await page.close();
}
await browser.close();
console.log('GitHub 入口、Work 展开、纵向引导线与球心位置、遮挡和统一排版检查通过。');
