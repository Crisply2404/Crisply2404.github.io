import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.SITE_URL ?? 'http://localhost:5174';
for (const cached of [true, false]) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads',
    ignoreDefaultArgs: cached ? ['--disable-back-forward-cache'] : [] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  const center = async () => {
    const rect = await page.locator('.entrance-ball').boundingBox();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };
  const unchanged = async (expected, message) => {
    await page.waitForTimeout(250);
    const actual = await center();
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.5,
      `${message}: ${JSON.stringify({ actual, expected })}`);
  };
  const drag = async (target) => {
    await page.waitForTimeout(350);
    const point = await center();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...point }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, ...target }] });
    await page.waitForTimeout(80);
    const following = await center();
    assert.ok(Math.hypot(following.x - target.x, following.y - target.y) < 0.5,
      'The ball must follow the finger before it releases');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(({ x, y }) => {
      const rect = document.querySelector('.entrance-ball').getBoundingClientRect();
      return Math.hypot(rect.x + 16 - x, rect.y + 16 - y) < 2;
    }, target);
  };
  await page.goto(`${url}/notes/`);
  await page.waitForSelector('.page-letter');
  await page.waitForTimeout(500);
  const spawn = await center();
  await page.touchscreen.tap(180, 220);
  await unchanged(spawn, 'Reading taps must preserve the ball');
  await page.locator('.empty-state').evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.touchscreen.tap(300, 360);
  await unchanged(spawn, 'Dismissing a text selection must preserve the ball');
  await page.evaluate(() => getSelection().removeAllRanges());
  const grabbed = { x: spawn.x + 6, y: spawn.y + 4 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...grabbed }] });
  await unchanged(spawn, 'Starting away from the center must preserve the grab position');
  for (const target of [{ x: 85, y: 250 }, { x: 160, y: 310 }, { x: 240, y: 240 }, { x: 120, y: 280 }]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, ...target }] });
    await unchanged({ x: target.x - 6, y: target.y - 4 }, 'Every turn in the drag must move the ball immediately');
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 450, y: 280 }] });
  await page.waitForTimeout(100);
  assert.ok((await center()).x <= 374, 'The complete ball must stay inside the horizontal viewport');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 120, y: 280 }] });
  await unchanged({ x: 114, y: 276 }, 'Returning from the screen edge must immediately follow the finger');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await unchanged({ x: 114, y: 276 }, 'Releasing the ball must stop it at its current position');
  await page.reload();
  await page.waitForSelector('.page-letter');
  await drag({ x: 190, y: spawn.y });
  await page.waitForTimeout(600);
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.some((letter) => Math.abs(new DOMMatrix(letter.style.transform).b) > 0.01)),
    'Intentional dragging must still push and rotate letters');
  await page.goto(`${url}/essays/`);
  await page.waitForSelector('.page-letter');
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForSelector('.page-letter');
  await unchanged(spawn, 'Mobile back must restore the initial ball');
  await page.goForward({ waitUntil: 'commit' });
  await page.waitForSelector('.page-letter');
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.every((letter) => Math.abs(new DOMMatrix(letter.style.transform).b) < 0.001)),
    'Mobile forward must restore letters');
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForSelector('.page-letter');
  await drag({ x: 190, y: spawn.y });
  await page.reload();
  await page.waitForSelector('.page-letter');
  await unchanged(spawn, 'Mobile refresh must restore the initial ball');
  await drag({ x: 190, y: spawn.y });
  await page.goto(`${url}/notes/`);
  await page.waitForSelector('.page-letter');
  await unchanged(spawn, 'Entering the same URL must restore the initial ball');
  assert.ok(await page.locator('.page-letter').evaluateAll((letters) => letters.every((letter) => Math.abs(new DOMMatrix(letter.style.transform).b) < 0.001)));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...spawn }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 250, y: 300 }] });
  await page.waitForTimeout(80);
  const cancelled = await center();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await unchanged(cancelled, 'Cancelling the ball drag must preserve its current position');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...cancelled }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...cancelled }, { id: 1, x: 300, y: 380 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 200, y: 200 }, { id: 1, x: 260, y: 310 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await unchanged(cancelled, 'Two fingers must stop ball dragging at its current position');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, x: 100, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, x: 100, y: 430 }, { id: 1, ...cancelled }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 100, y: 430 }, { id: 1, x: 180, y: 280 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await unchanged(cancelled, 'A second finger touching the ball must not start dragging');
  await page.goto(url);
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  await page.waitForSelector('.page-letter');
  const textError = await page.getByRole('button', { name: 'Switch to game view' }).evaluate((button) => {
    const nativeRange = document.createRange(); nativeRange.selectNodeContents(button);
    const letter = [...document.querySelectorAll('.page-letter')].find((element) => element.textContent === '◉');
    const shownRange = document.createRange(); shownRange.selectNodeContents(letter);
    const native = nativeRange.getBoundingClientRect(), shown = shownRange.getBoundingClientRect();
    return Math.hypot(native.x - shown.x, native.y - shown.y);
  });
  assert.ok(textError < 0.2, 'The button character must preserve its native vertical position');
  assert.deepEqual(errors, []);
  await page.close();
  await browser.close();
  console.log(`手机阅读选择、球体拖动、取消、前进后退、刷新、同地址进入和按钮字符检查通过：返回缓存 ${cached}`);
}
