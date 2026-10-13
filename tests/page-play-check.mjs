import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.SITE_URL ?? 'http://localhost:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('mono-wasd-orientation', '0'));
await page.goto(`${url}/notes/`);
await page.waitForSelector('.page-letter');
await page.mouse.move(1100, 600);
const ball = page.locator('.entrance-ball');
const before = await ball.boundingBox();
const heading = await page.locator('.collection-title').boundingBox();
assert.ok(Math.abs(before.y + 16 - heading.y - heading.height / 2) < 1);
const lettersBefore = await page.locator('.page-letter').evaluateAll((elements) => elements.map((element) => element.style.transform));
const headingPositions = await page.locator('.page-letter').evaluateAll((elements) => elements.slice(11, 16).map((element) => {
  const matrix = new DOMMatrix(element.style.transform);
  return { x: matrix.e, y: matrix.f };
}));
const nativeHeadingPositions = await page.locator('.collection-title').evaluate((element) => {
  const range = document.createRange();
  return Array.from(element.textContent).map((_, index) => {
    range.setStart(element.firstChild, index); range.setEnd(element.firstChild, index + 1);
    const bounds = range.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });
});
for (let index = 0; index < headingPositions.length; index += 1) {
  assert.ok(Math.hypot(headingPositions[index].x - nativeHeadingPositions[index].x,
    headingPositions[index].y - nativeHeadingPositions[index].y) < 0.1, 'Characters must preserve native text layout');
}
await page.keyboard.down('d');
await page.waitForTimeout(850);
await page.keyboard.up('d');
await page.waitForTimeout(1300);
const lettersAfter = await page.locator('.page-letter').evaluateAll((elements) => elements.map((element) => element.style.transform));
assert.ok(lettersAfter.some((value, index) => value !== lettersBefore[index]),
  `The ball must push separate letters: ${JSON.stringify({ before, after: await ball.boundingBox(), heading,
    lettersBefore: lettersBefore.slice(11, 16), lettersAfter: lettersAfter.slice(11, 16) })}`);
assert.ok(lettersAfter.some((value) => !value.endsWith('rotate(0rad)')), 'Letters must rotate through collision');
const ballAfter = await ball.boundingBox();
await page.evaluate(() => {
  document.querySelector('.content-root').style.minHeight = '2400px';
  window.scrollTo(0, 1200);
});
await page.waitForTimeout(250);
const fixedHeader = await page.locator('.page-header-letter').first().boundingBox();
assert.ok(Math.abs(fixedHeader.y - 29) < 1, 'Header letters must remain at the top during scrolling');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
const afterScroll = await ball.boundingBox();
assert.ok(Math.hypot(afterScroll.x - ballAfter.x, afterScroll.y - ballAfter.y) < 0.5, 'Scrolling must preserve the ball position');
const scrollDifference = await page.locator('.page-letter').evaluateAll((elements, previous) => elements.map((element, index) => {
  const before = new DOMMatrix(element.style.transform);
  const after = new DOMMatrix(previous[index]);
  return Math.max(Math.abs(before.e - after.e), Math.abs(before.f - after.f), Math.abs(before.a - after.a), Math.abs(before.b - after.b));
}), lettersAfter);
assert.ok(scrollDifference.every((difference) => difference < 0.1), 'Scrolling must preserve the displaced letters');
await page.goto(`${url}/essays/`);
await page.waitForSelector('.entrance-ball');
await page.goBack();
await page.waitForSelector('.page-letter');
await page.waitForTimeout(300);
const returned = await ball.boundingBox();
assert.ok(Math.hypot(returned.x - before.x, returned.y - before.y) < 0.5, 'History must restore the title spawn');
const returnedLetters = await page.locator('.page-letter').evaluateAll((elements) => elements.map((element) => element.style.transform));
assert.ok(returnedLetters.every((value) => value.endsWith('rotate(0rad)')), 'History must restore the initial letter arrangement');
await page.goForward();
await page.waitForSelector('.entrance-ball');
assert.ok(await page.locator('.page-letter').evaluateAll((elements) => elements.every((element) => element.style.transform.endsWith('rotate(0rad)'))),
  'Forward navigation must restore the initial letter arrangement');
await page.goBack();
await page.waitForSelector('.entrance-ball');
await page.setViewportSize({ width: 1000, height: 700 });
await page.waitForTimeout(500);
assert.ok(await page.locator('.page-letter').evaluateAll((elements) => elements.every((element) => element.style.transform.endsWith('rotate(0rad)'))),
  'Resizing must preserve the current letter arrangement');
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(300);
await page.reload();
await page.waitForSelector('.entrance-ball');
const refreshed = await ball.boundingBox();
assert.ok(Math.abs(refreshed.x - before.x) < 0.5, 'Refreshing must restore the title spawn');
await page.setViewportSize({ width: 1440, height: 800 });
await page.waitForTimeout(200);
const resizedHeader = await page.locator('.collection-title').boundingBox();
const resizedFirstLetter = await page.locator('.page-letter').nth(11).boundingBox();
assert.ok(Math.abs(resizedFirstLetter.x - resizedHeader.x) < 1, 'A centered layout must remeasure letters after viewport changes');
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(200);
await page.keyboard.down('w');
await page.waitForTimeout(300);
const beforeTurn = await ball.boundingBox();
await page.keyboard.press('q');
await page.waitForTimeout(300);
const duringTurn = await ball.boundingBox();
assert.ok(Math.abs(duringTurn.x - beforeTurn.x) < 0.5, 'W must stay upward while rotating the cursor');
await page.keyboard.up('w');
const up = await ball.boundingBox();
assert.ok(up.y < refreshed.y - 15 && Math.abs(up.x - refreshed.x) < 0.5, 'W must always move up in reading pages');
const setting = await page.evaluate(() => localStorage.getItem('mono-wasd-orientation'));
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => localStorage.getItem('mono-wasd-orientation')), setting);
assert.equal(await page.locator('.control-preview').count(), 0);
await page.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto(url);
await mobile.getByRole('button', { name: 'Switch to list view' }).click();
await mobile.waitForSelector('.entrance-ball');
await mobile.waitForTimeout(500);
await mobile.touchscreen.tap(300, 460);
await mobile.waitForFunction(() => {
  const bounds = document.querySelector('.entrance-ball').getBoundingClientRect();
  return Math.hypot(bounds.x + 16 - 300, bounds.y + 16 - 460) < 2;
});
const target = await mobile.locator('.entrance-ball').boundingBox();
assert.ok(Math.hypot(target.x + 16 - 300, target.y + 16 - 460) < 2, 'A mobile tap must move the ball to its destination');
assert.equal(await mobile.locator('.game-cursor').isVisible(), false);
await mobile.close();

const article = await browser.newPage({ viewport: { width: 1000, height: 700 } });
article.on('pageerror', (error) => errors.push(error.message));
await article.goto(`${url}/tests/page-play.html`);
await article.evaluate(async () => {
  const { EntranceBall, pagePhysicsReady } = await import('/src/entrance-ball.ts');
  const { physicsReady } = await import('/src/mono/physics.ts');
  await Promise.all([physicsReady, pagePhysicsReady]);
  document.querySelector('#app').innerHTML = '<div class="site-shell"><main class="content-root"><div class="reading-column"><h3>中文 title</h3><p>独立文字 abc 文本</p></div></main></div>';
  window.articlePlay = new EntranceBall(document.querySelector('.reading-column'));
});
await article.waitForSelector('.page-letter');
assert.ok((await article.locator('.page-letter').allTextContents()).includes('中'), 'Chinese graphemes must have independent objects');
assert.ok((await article.locator('.page-letter').allTextContents()).includes('独'), 'Body text must participate');
await article.keyboard.down('d');
await article.waitForTimeout(700);
await article.keyboard.up('d');
await article.waitForTimeout(800);
assert.ok(await article.locator('.page-letter').evaluateAll((elements) => elements.some((element) => !element.style.transform.endsWith('rotate(0rad)'))),
  'Chinese characters must rotate through real collision');
await article.evaluate(() => window.articlePlay.destroy());
await article.close();
assert.deepEqual(errors, []);
await browser.close();
console.log('逐字碰撞、自由旋转、滚动保留、后退与刷新恢复、网页独立 W 朝上与手机点按检查通过。');
