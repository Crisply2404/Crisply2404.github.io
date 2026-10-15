import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
for (const duration of [300, 50]) {
  await page.goto('http://127.0.0.1:5174/tests/page-play.html');
  await page.evaluate(async () => {
    const [{ EntranceBall, pagePhysicsReady }, { physicsReady }] = await Promise.all([
      import('/src/entrance-ball.ts'), import('/src/mono/physics.ts')]);
    await Promise.all([physicsReady, pagePhysicsReady]);
    document.querySelector('#app').innerHTML = '<div class="site-shell"><main class="content-root"><div class="reading-column"><h1>Notes</h1></div></main></div>';
    window.play = new EntranceBall(document.querySelector('.reading-column'));
  });
  await page.waitForTimeout(500);
  const ball = await page.locator('.entrance-ball').boundingBox();
  const x = ball.x + 16, y = ball.y + 16;
  await page.mouse.move(x - 100, y - 42);
  await page.waitForTimeout(100);
  const before = await page.locator('.game-cursor').boundingBox();
  await page.mouse.move(x - 35, y - 42);
  await page.waitForTimeout(duration);
  await page.mouse.move(x - 24, y - 42);
  const impact = await page.evaluate(() => ({ velocity: window.play.strikeVelocity.length(),
    center: window.play.ballCenter().toArray(), contact: window.play.cursor.contact(window.play.ballCenter()) }));
  assert.ok(impact.velocity > 0, 'A moving cursor must give the ball momentum');
  assert.ok(!impact.contact || impact.contact.distance >= -0.001, 'The stroke boundaries must not overlap after collision');
  const cursor = await page.locator('.game-cursor').boundingBox();
  assert.ok(Math.abs(cursor.x - before.x - 76) < 0.01, 'The cursor must follow the pointer without recoil');
  await page.mouse.move(x - 100, y - 42);
  await page.waitForTimeout(250);
  const after = await page.locator('.entrance-ball').boundingBox();
  assert.ok(Math.hypot(after.x + 16 - impact.center[0], after.y + 16 - impact.center[1]) > 0.5,
    'The ball must continue moving after the cursor separates');
  results.push({ duration, velocity: impact.velocity });
}
assert.ok(results[1].velocity > results[0].velocity * 1.5, 'Faster strikes must give more momentum: ' + JSON.stringify(results));
const contactChecks = await page.evaluate(async () => {
  const play = window.play;
  play.cursor.hide();
  play.respawn();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const checks = [];
  for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
    play.cursor.setAngle(angle);
    for (const direction of [-1, 1]) {
      const center = play.ballCenter();
      play.cursor.move(center.x + direction * 24, center.y - 42);
      play.collideCursor();
      const hit = play.cursor.contact(play.ballCenter());
      checks.push(hit?.distance ?? 0);
      play.strikeVelocity.set(0, 0);
    }
  }
  play.cursor.hide();
  play.respawn();
  return checks;
});
assert.ok(contactChecks.every((distance) => distance >= -0.001), JSON.stringify(contactChecks));
await page.keyboard.down('a');
await page.waitForTimeout(2200);
await page.keyboard.up('a');
await page.waitForTimeout(500);
const edgeBall = await page.locator('.entrance-ball').boundingBox();
await page.mouse.move(edgeBall.x + 116, edgeBall.y - 26);
await page.waitForTimeout(300);
await page.mouse.move(edgeBall.x + 40, edgeBall.y - 26);
const edgeContact = await page.evaluate(() => window.play.cursor.contact(window.play.ballCenter()));
assert.ok(!edgeContact || edgeContact.distance >= -0.001, 'Screen-edge contact must separate both stroke boundaries: ' + JSON.stringify(edgeContact));
const edgeChecks = await page.evaluate(() => {
  const play = window.play;
  const checks = [];
  for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
    play.cursor.setAngle(angle);
    for (const side of [-1, 1]) {
      play.screenOffset.set(side * 5000, 0);
      play.pushed.set(0, 0);
      play.placeBall();
      const center = play.ballCenter();
      play.cursor.move(center.x - side * 24, center.y - 42);
      const before = play.cursor.contact(play.ballCenter());
      play.collideCursor();
      const after = play.cursor.contact(play.ballCenter());
      checks.push({ before: before?.distance, after: after?.distance ?? 0, x: play.ballCenter().x });
    }
  }
  return checks;
});
assert.ok(edgeChecks.every(({ before, after, x }) => before < 0 && after >= -0.001 && x >= 32 && x <= 1248), JSON.stringify(edgeChecks));
await page.evaluate(() => { window.play.cursor.hide(); window.play.respawn(); });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const play = window.play;
  const center = play.ballCenter();
  play.cursor.move(center.x, center.y - 42);
  cancelAnimationFrame(play.animationFrame);
});
const ballBounds = await page.locator('.entrance-ball').boundingBox();
const combined = PNG.sync.read(await page.screenshot({ clip: ballBounds }));
await page.locator('.entrance-ball').evaluate((element) => { element.style.visibility = 'hidden'; });
const cursorOnly = PNG.sync.read(await page.screenshot({ clip: ballBounds }));
await page.locator('.entrance-ball').evaluate((element) => { element.style.visibility = ''; });
await page.locator('.game-cursor').evaluate((element) => { element.style.visibility = 'hidden'; });
const ballOnly = PNG.sync.read(await page.screenshot({ clip: ballBounds }));
let intersectionPixels = 0;
for (let index = 0; index < combined.data.length; index += 4) {
  if (cursorOnly.data[index] > 100 && ballOnly.data[index] > 100) {
    intersectionPixels += 1;
    assert.ok(combined.data[index] > 100, 'Intersecting white strokes must retain white pixels');
  }
}
assert.ok(intersectionPixels > 0, 'The pixel check must contain actual intersecting strokes');
assert.deepEqual(errors, []);
await browser.close();
console.log(JSON.stringify(results));
console.log('真实光标击球速度、分离后运动、线条边界接触和光标位置检查通过。');
