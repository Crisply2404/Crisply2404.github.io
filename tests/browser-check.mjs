import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

async function siteTitleBounds(page) {
  return page.locator('.site-title').evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
}

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
const siteResults = await page.evaluate(() => window.runSiteChecks());
assert.deepEqual(errors, []);
console.log(JSON.stringify({ rendering: results, site: siteResults }));
await page.goto('http://localhost:5174/');
await page.waitForSelector('.scene-canvas');
await page.waitForFunction(() => document.querySelector('canvas')?.width > 100);
await page.screenshot({ path: '.work/screenshots/desktop.png' });
assert.equal(await page.locator('.mobile-controls').isVisible(), false);
await page.getByRole('button', { name: 'Switch to list view' }).click();
assert.equal(await page.locator('.entrance-list > .entry-row').count(), 3);
await page.reload();
assert.equal(await page.locator('.entrance-list > .entry-row').count(), 3);
const listTitle = await siteTitleBounds(page);
await page.getByRole('button', { name: 'Switch to game view' }).click();
await page.waitForSelector('.scene-canvas');
assert.deepEqual(errors, []);
console.log('浏览器渲染、形态切换和选择保存检查通过。');

for (const collection of ['notes', 'essays']) {
  await page.goto(`http://localhost:5174/${collection}/`);
  assert.equal(await page.locator('.site-header .site-title').textContent(), 'Crisply2404');
  const collectionTitle = await siteTitleBounds(page);
  assert.deepEqual(collectionTitle, listTitle, `${collection} site title moved`);
  assert.equal(await page.locator('.reading-navigation').count(), 0);
  assert.equal(await page.locator('.reading-kicker').count(), 0);
  const header = await page.locator('.site-header').boundingBox();
  assert.equal(header.x, 0); assert.equal(header.y, 0);
  const title = await page.locator('.collection-title').evaluate((element) => ({
    fontSize: parseFloat(getComputedStyle(element).fontSize), top: element.getBoundingClientRect().top,
  }));
  assert.ok(title.fontSize <= 26 && title.top >= 112);
  await page.locator('.site-title').click();
  await page.waitForSelector('.scene-canvas');
}
console.log('阅读页固定站点名称、分类标题尺寸和主页返回检查通过。');

await page.goto('http://localhost:5174/tests/game.html');
await page.waitForFunction(() => window.game?.player.grounded);
assert.equal(await page.locator('.door-links').count(), 0);
assert.equal(await page.locator('.tutorial-input').count(), 6);
assert.deepEqual(await page.locator('.tutorial-wasd kbd').allTextContents(), ['W', 'A', 'S', 'D']);
assert.equal(await page.locator('.tutorial-mouse').count(), 1);
assert.equal(await page.locator('[data-control="mode"]').getAttribute('aria-label'), 'Tab: Switch control mode');
assert.equal(await page.locator('[data-key="tab"]').textContent(), 'Tab');
assert.deepEqual(await page.locator('.tutorial-input').evaluateAll((items) => items.map((item) => item.dataset.control)),
  ['move', 'click', 'jump', 'rotate', 'mode', 'speech']);
const keyStyles = await page.locator('.tutorial-input kbd').evaluateAll((keys) => keys.map((key) => {
  const style = getComputedStyle(key), bounds = key.getBoundingClientRect();
  return { key: key.dataset.key, radius: style.borderRadius, border: style.borderTopWidth,
    width: bounds.width, height: bounds.height, background: style.backgroundColor };
}));
for (const key of keyStyles) {
  assert.equal(key.radius, '0px'); assert.equal(key.border, '1px');
  if (['space', 'tab', 'enter'].includes(key.key)) assert.ok(key.width > key.height);
  else assert.equal(key.width, key.height);
  assert.equal(key.height, keyStyles[0].height);
}
await page.locator('.tutorial-input kbd').evaluateAll((keys) => {
  const family = getComputedStyle(document.documentElement).fontFamily;
  for (const key of keys) {
    const style = getComputedStyle(key);
    if (style.fontFamily !== family || style.fontWeight !== '400') throw new Error('Tutorial keys must use the site title font');
  }
});
assert.equal(await page.evaluate(() => window.game.orientation), 2);
const state = () => page.evaluate(() => {
  const game = window.game;
  return { x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, angle: game.targetCameraAngle,
    vx: game.player.vel.x, vz: game.player.vel.z, grounded: game.player.grounded, path: game.path.length };
});
await page.keyboard.down('w');
await page.waitForFunction(() => window.game.player.pos.z < 30);
const diagonal = await state();
assert.ok(diagonal.x < -10);
assert.ok(Math.abs(diagonal.x - diagonal.z + 40) < 0.3, JSON.stringify(diagonal));
await page.keyboard.up('w'); await page.keyboard.press('r');
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => window.game.orientation), 1);
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => window.game.orientation), 0);
await page.keyboard.down('d');
await page.waitForFunction(() => window.game.player.pos.z < 15);
const beforeRotation = await state();
await page.keyboard.press('q');
assert.equal((await state()).angle, Math.PI * 3 / 4);
await page.waitForFunction(() => window.game.player.pos.z < -15);
const afterRotation = await state();
assert.ok(Math.abs(afterRotation.x - beforeRotation.x) < Math.abs(afterRotation.z - beforeRotation.z) * 0.02,
  `Continuous movement must preserve its world direction while rotating: ${JSON.stringify({ beforeRotation, afterRotation })}`);
await page.keyboard.up('d'); await page.keyboard.press('r');
await page.waitForFunction(() => window.game.player.grounded);
await page.keyboard.down(' ');
await page.waitForFunction(() => window.game.player.pos.y > 100);
await page.keyboard.up(' ');
await page.waitForFunction(() => window.game.player.grounded);
assert.ok(Math.abs((await state()).y - 40.01) < 0.1);

const clickWorld = async (x, z) => {
  await page.waitForFunction(() => Math.abs(window.game.cameraAngle - window.game.targetCameraAngle) < 0.00001);
  const projected = await page.evaluate(({ x, z }) => {
    const game = window.game;
    const point = game.player.pos.clone().set(x, 20, z).project(game.camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, { x, z });
  await page.mouse.click(projected.x, projected.y);
};
await Promise.all([
  page.waitForFunction(() => window.game.ripple.visible),
  clickWorld(0, -100),
]);
await page.waitForFunction(() => window.game.path.length === 0, undefined, { polling: 100 });
const safe = await state();
assert.ok(Math.abs(safe.z + 100) < 5, JSON.stringify(safe));
await clickWorld(200, -100);
assert.equal((await state()).path, 0);
assert.ok(Math.abs((await state()).z - safe.z) < 1);
await page.keyboard.press('Tab');
assert.equal(await page.locator('.control-preview').isVisible(), true);
await clickWorld(-72, -160);
await page.waitForFunction(() => window.routes.includes('/notes/'), undefined, { polling: 100 });
assert.ok(await page.evaluate(() => window.routes.includes('/notes/')), JSON.stringify(await page.evaluate(() => ({
  position: window.game.player.pos.toArray(),
  path: window.game.path.map((point) => point.position.toArray()),
  grounded: window.game.player.grounded,
  routes: window.routes,
}))));
await page.waitForTimeout(100);
assert.deepEqual(await page.evaluate(() => window.routes), ['/notes/']);
await page.waitForSelector('.control-tutorial', { state: 'detached' });
assert.deepEqual(errors, []);
console.log('真实键盘移动、镜头旋转、跳跃、鼠标寻路和自动进入门检查通过。');
await page.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto('http://localhost:5174/tests/game.html');
await mobile.waitForFunction(() => window.game?.player.grounded);
assert.equal(await mobile.evaluate(() => innerWidth), 390);
assert.equal(await mobile.locator('.mobile-controls').isVisible(), true);
assert.equal(await mobile.locator('.touch-button').count(), 3);
assert.equal(await mobile.locator('.dpad').count(), 0);
assert.equal(await mobile.locator('.tutorial-input').count(), 5);
assert.equal(await mobile.locator('.tutorial-wasd').count(), 0);
assert.equal(await mobile.locator('.tutorial-tap').count(), 1);
assert.equal(await mobile.locator('.tutorial-gesture .tutorial-finger').count(), 2);
await mobile.locator('.tutorial-input kbd, .touch-button').evaluateAll((keys) => {
  const family = getComputedStyle(document.documentElement).fontFamily;
  for (const key of keys) {
    const style = getComputedStyle(key);
    if (style.borderTopWidth !== '1px' || style.fontFamily !== family || style.fontWeight !== '400') {
      throw new Error('Mobile keys must have 1px borders and the site title font');
    }
    if (key.tagName === 'BUTTON' && style.webkitTapHighlightColor !== 'rgba(0, 0, 0, 0)') {
      throw new Error('Mobile button tap highlight must be transparent');
    }
  }
});
await mobile.screenshot({ path: '.work/screenshots/mobile.png' });
const rectangles = await mobile.locator('.touch-button').evaluateAll((buttons) => buttons.map((button) => {
  const rect = button.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}));
for (const rect of rectangles) {
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 390 && rect.y + rect.height <= 844);
}
const jump = await mobile.getByRole('button', { name: 'jump', exact: true }).boundingBox();
assert.ok(jump);
const cdp = await mobile.context().newCDPSession(mobile);
const projectMobile = (x, z) => mobile.evaluate(({ x, z }) => {
  const point = window.game.player.pos.clone().set(x, 20, z).project(window.game.camera);
  return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
}, { x, z });
const destination = await projectMobile(0, -80);
await mobile.touchscreen.tap(destination.x, destination.y);
await mobile.waitForFunction(() => window.game.path.length === 0 && Math.abs(window.game.player.pos.z + 80) < 1);
const viewBefore = await mobile.evaluate(() => ({ zoom: window.game.camera.zoom, offset: window.game.viewOffset.toArray() }));
let fingers = [{ id: 0, x: 130, y: 450 }, { id: 1, x: 250, y: 450 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers });
fingers = [{ id: 0, x: 80, y: 450 }, { id: 1, x: 300, y: 450 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers });
await mobile.waitForFunction(() => window.game.camera.zoom > 1.7);
fingers = fingers.map((finger) => ({ ...finger, x: finger.x + 30, y: finger.y - 25 }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [fingers[0]] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const viewAfter = await mobile.evaluate(() => ({ zoom: window.game.camera.zoom, offset: window.game.viewOffset.toArray(),
  path: window.game.path.length, position: window.game.player.pos.toArray() }));
assert.ok(viewAfter.zoom > viewBefore.zoom);
assert.notDeepEqual(viewAfter.offset, viewBefore.offset);
assert.equal(viewAfter.path, 0); assert.ok(Math.abs(viewAfter.position[2] + 80) < 1);
assert.deepEqual(await mobile.locator('.touch-button').evaluateAll((buttons) => buttons.map((button) => {
  const { x, y, width, height } = button.getBoundingClientRect(); return { x, y, width, height };
})), rectangles);
const nextDestination = await projectMobile(0, -110);
await mobile.touchscreen.tap(nextDestination.x, nextDestination.y);
await mobile.waitForFunction(() => window.game.path.length === 0 && Math.abs(window.game.player.pos.z + 110) < 1);
const jumpTouch = { id: 2, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [jumpTouch] });
await mobile.waitForFunction(() => window.game.player.pos.y > 65 && window.game.jumpPressed, undefined, { polling: 10 });
await mobile.waitForFunction(() => getComputedStyle(document.querySelector('.touch-button[data-action="jump"]')).backgroundColor === 'rgb(255, 255, 255)');
assert.equal(await mobile.locator('.touch-button[data-action="jump"]').evaluate((button) => getComputedStyle(button).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)');
const pressedButton = PNG.sync.read(await mobile.locator('.touch-button[data-action="jump"]').screenshot());
for (let index = 0; index < pressedButton.data.length; index += 4) {
  assert.equal(pressedButton.data[index], pressedButton.data[index + 1], 'Pressed mobile button contains colored pixels');
  assert.equal(pressedButton.data[index], pressedButton.data[index + 2], 'Pressed mobile button contains colored pixels');
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...fingers, jumpTouch] });
fingers = fingers.map((finger) => ({ ...finger, x: finger.x - 15, y: finger.y + 10 }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...fingers, jumpTouch] });
assert.equal(await mobile.evaluate(() => window.game.jumpPressed), true);
assert.equal(await mobile.evaluate(() => window.game.path.length), 0);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
await mobile.waitForFunction(() => !window.game.jumpPressed && window.game.canvasNavigation.pointers.size === 0);
assert.equal(await mobile.locator('.touch-button.is-active').count(), 0);
await mobile.waitForFunction(() => window.game.player.grounded);
const rotationBefore = await mobile.evaluate(() => window.game.targetCameraAngle);
const rotate = await mobile.getByRole('button', { name: 'rotateLeft', exact: true }).boundingBox();
await mobile.touchscreen.tap(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
assert.equal(await mobile.evaluate(() => window.game.targetCameraAngle), rotationBefore + Math.PI / 2);
assert.equal(await mobile.evaluate(() => window.game.path.length), 0);
assert.equal(await mobile.locator('.touch-button.is-active').count(), 0);
const dragStart = await projectMobile(0, -140);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, ...dragStart }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: dragStart.x + 25, y: dragStart.y }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert.equal(await mobile.evaluate(() => window.game.path.length), 0);
assert.deepEqual(errors, []);
console.log('手机单指寻路、双指缩放与平移、独立按钮和取消释放检查通过。');
await mobile.goto('http://localhost:5174/');
await mobile.getByRole('button', { name: 'Switch to list view' }).click();
const mobileTitle = await siteTitleBounds(mobile);
assert.equal(await mobile.locator('.site-title').evaluate((element) => getComputedStyle(element).textTransform), 'none');
assert.equal(await mobile.locator('.site-title').textContent(), 'Crisply2404');
await mobile.locator('.entry-row').evaluateAll((rows) => {
  for (const row of rows) {
    const children = [...row.children].map((child) => child.getBoundingClientRect());
    const center = children[0].y + children[0].height / 2;
    if (children.some((child) => Math.abs(child.y + child.height / 2 - center) > 1)) throw new Error('Mobile entrance row must remain on one line');
    if (row.scrollWidth > row.clientWidth) throw new Error('Mobile entrance row overflows');
  }
});
for (const collection of ['notes', 'essays']) {
  await mobile.goto(`http://localhost:5174/${collection}/`);
  const title = await siteTitleBounds(mobile);
  assert.deepEqual(title, mobileTitle, `Mobile ${collection} site title moved`);
}
console.log('桌面与手机列表页、notes 和 essays 的站点名称坐标检查通过。');
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  for (const hasTouch of [false, true]) {
  const tutorial = await browser.newPage({ viewport, hasTouch, isMobile: hasTouch });
  tutorial.on('pageerror', (error) => errors.push(error.message));
  await tutorial.goto('http://localhost:5174/tests/tutorial.html');
  await tutorial.waitForFunction(() => typeof window.runTutorialChecks === 'function');
  const result = await tutorial.evaluate(() => window.runTutorialChecks());
  console.log(JSON.stringify({ viewport, hasTouch, tutorial: result }));
  await tutorial.close();
  }
}
for (const deviceScaleFactor of [2, 3]) {
  const dense = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor });
  dense.on('pageerror', (error) => errors.push(error.message));
  await dense.goto('http://localhost:5174/tests/render.html');
  await dense.waitForFunction(() => typeof window.runRenderChecks === 'function');
  const results = await dense.evaluate(() => window.runRenderChecks());
  const site = await dense.evaluate(() => window.runSiteChecks());
  console.log(JSON.stringify({ deviceScaleFactor, rendering: results, site }));
  await dense.close();
}
assert.deepEqual(errors, []);
await browser.close();
