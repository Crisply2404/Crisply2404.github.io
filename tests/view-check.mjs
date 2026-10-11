import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const errors = [];
const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
desktop.on('pageerror', (error) => errors.push(error.message));
await desktop.goto('http://localhost:5174/');
await desktop.waitForSelector('.control-tutorial');
const tutorial = await desktop.locator('.control-tutorial').boundingBox();
assert.ok(tutorial.y > 800 / 2);
assert.ok(Math.abs(800 - tutorial.y - tutorial.height - 64) < 1);
await desktop.locator('.view-toggle').evaluate((button) => {
  const header = button.closest('.site-header');
  const hint = document.querySelector('.control-tutorial');
  const style = getComputedStyle(button);
  const bounds = button.getBoundingClientRect();
  if (style.backgroundColor !== 'rgb(0, 0, 0)') throw new Error('View toggle must be opaque black');
  if (Number(getComputedStyle(header).zIndex) <= Number(getComputedStyle(hint).zIndex)) throw new Error('Header must be above tutorial');
  if (document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) !== button) throw new Error('View toggle must be in front');
});
await desktop.goto('http://localhost:5174/tests/game.html');
await desktop.waitForFunction(() => window.game?.player.grounded);
await desktop.keyboard.press('Tab');
assert.equal(await desktop.evaluate(() => window.game.orientation), 1);
await desktop.reload();
await desktop.waitForFunction(() => window.game?.player.grounded);
assert.equal(await desktop.evaluate(() => window.game.orientation), 1);
for (const orientation of [0, 2, 1]) {
  await desktop.keyboard.press('Tab');
  assert.equal(await desktop.evaluate(() => window.game.orientation), orientation);
  await desktop.reload();
  await desktop.waitForFunction(() => window.game?.player.grounded);
  assert.equal(await desktop.evaluate(() => window.game.orientation), orientation);
  await desktop.waitForFunction((orientation) => {
    const position = window.game.controlTutorial.movement.player.pos;
    if (orientation === 0) return position.x < -8 && Math.abs(position.z) < 0.02;
    if (orientation === 1) return position.z < -8 && Math.abs(position.x) < 0.02;
    return position.x < -8 && Math.abs(position.x - position.z) < 0.02;
  }, orientation);
}
const titleFonts = () => desktop.evaluate(() => {
  const titles = [];
  window.game.scene.traverse((object) => {
    if (object.name === 'DoorTitle') titles.push({ font: object.material.map.image.getContext('2d').font, id: object.material.map.uuid });
  });
  return titles;
});
const initialFonts = await titleFonts();
assert.equal(initialFonts.length, 2);
assert.ok(initialFonts.every((title) => title.font.startsWith('500 ')));
await desktop.evaluate(() => document.documentElement.style.setProperty('--door-title-font-weight', '600'));
await desktop.waitForFunction(() => {
  const titles = [];
  window.game.scene.traverse((object) => { if (object.name === 'DoorTitle') titles.push(object.material.map.image.getContext('2d').font); });
  return titles.length === 2 && titles.every((font) => font.startsWith('600 '));
});
assert.ok((await titleFonts()).every((title, index) => title.id !== initialFonts[index].id));
await desktop.evaluate(() => document.documentElement.style.setProperty('--door-title-font-weight', '500'));
console.log('桌面底部提示、按钮层级、三种控制模式的刷新保存与门名字重即时更新检查通过。');
await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto('http://localhost:5174/tests/game.html');
await mobile.waitForFunction(() => window.game?.player.grounded);
assert.equal(await mobile.evaluate(() => window.game.camera.zoom), 1.5);
assert.equal(await mobile.locator('.tutorial-finger').count(), 3);
const mobileHint = await mobile.locator('.control-tutorial').boundingBox();
assert.ok(mobileHint.y < 100);
const cdp = await mobile.context().newCDPSession(mobile);
const visibleBall = async () => {
  await mobile.waitForTimeout(35);
  const bounds = await mobile.evaluate(() => {
    const game = window.game, center = game.player.pos.clone().project(game.camera);
    const radius = 22.5 * innerHeight * game.camera.zoom / (game.camera.top - game.camera.bottom);
    return { x: (center.x + 1) * innerWidth / 2, y: (1 - center.y) * innerHeight / 2, radius,
      width: innerWidth, height: innerHeight, zoom: game.camera.zoom };
  });
  assert.ok(bounds.x - bounds.radius >= 23.9 && bounds.x + bounds.radius <= bounds.width - 23.9, JSON.stringify(bounds));
  assert.ok(bounds.y - bounds.radius >= 75.9 && bounds.y + bounds.radius <= bounds.height - 87.9, JSON.stringify(bounds));
  assert.ok(bounds.zoom >= 1 && bounds.zoom <= 3);
};
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, x: 120, y: 450 }, { id: 1, x: 270, y: 450 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 190, y: 450 }, { id: 1, x: 200, y: 450 }] });
await mobile.waitForFunction(() => window.game.camera.zoom === 1);
assert.equal(await mobile.evaluate(() => window.game.camera.zoom), 1);
await visibleBall();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: 50, y: 450 }, { id: 1, x: 340, y: 450 }] });
await mobile.waitForFunction(() => window.game.camera.zoom === 3);
assert.equal(await mobile.evaluate(() => window.game.camera.zoom), 3);
await visibleBall();
for (const [x, y] of [[5, 100], [300, 780], [5, 780], [300, 100], [150, 450]]) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x, y }, { id: 1, x: x + 70, y }] });
  await visibleBall();
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
assert.equal(await mobile.evaluate(() => window.game.path.length), 0);
for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
  await mobile.setViewportSize(viewport);
  await visibleBall();
  for (let turn = 0; turn < 4; turn += 1) {
    const button = await mobile.getByRole('button', { name: 'rotateLeft', exact: true }).boundingBox();
    await mobile.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    for (let frame = 0; frame < 8; frame += 1) await visibleBall();
  }
}
console.log('手机初始放大、缩放上下限、平移、旋转与尺寸变化期间的完整球体边界检查通过。');
await mobile.close();

const list = await browser.newPage({ viewport: { width: 320, height: 240 }, isMobile: true, hasTouch: true });
list.on('pageerror', (error) => errors.push(error.message));
await list.goto('http://localhost:5174/');
await list.getByRole('button', { name: 'Switch to list view' }).click();
await list.mouse.move(0, 200);
const before = PNG.sync.read(await list.locator('.site-header').screenshot());
await list.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
assert.ok(await list.evaluate(() => scrollY > 0));
assert.equal(await list.locator('.site-header').evaluate((header) => getComputedStyle(header).backgroundColor), 'rgb(0, 0, 0)');
const after = PNG.sync.read(await list.locator('.site-header').screenshot());
assert.deepEqual(after.data, before.data, 'Scrolling entries must not show through the fixed header');
console.log('手机列表真实滚动与顶部栏不透明遮挡检查通过。');
await list.close();
assert.deepEqual(errors, []);
await browser.close();
