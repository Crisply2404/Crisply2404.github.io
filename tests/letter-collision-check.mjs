import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5174/tests/page-play.html');
const results = await page.evaluate(async () => {
  const { PageLetters, pagePhysicsReady } = await import('/src/page-letters.ts');
  const { physicsReady } = await import('/src/mono/physics.ts');
  const RAPIER = (await import('/node_modules/@dimforge/rapier2d-compat/dist/rapier.mjs')).default;
  await physicsReady;
  await pagePhysicsReady;
  await RAPIER.init();
  const results = [];
  for (const speed of [0.5, 3.2, 6]) {
    document.querySelector('#app').innerHTML = '<div class="site-shell"><h1 style="position:absolute;left:200px;top:200px;margin:0;font:30px monospace">ABCDE</h1></div>';
    const shell = document.querySelector('.site-shell');
    const letters = new PageLetters(shell);
    const elements = [...document.querySelectorAll('.page-letter')];
    const starting = elements.map((element) => element.getBoundingClientRect().x);
    let maximumOverlap = 0;
    for (let tick = 0; tick < Math.ceil(180 / speed); tick += 1) {
      letters.step({ x: 170 + tick * speed, y: 217 }, true);
      const shapes = elements.map((element) => {
        const transform = new DOMMatrix(element.style.transform);
        const width = parseFloat(element.style.width), height = parseFloat(element.style.height);
        const angle = Math.atan2(transform.b, transform.a);
        return { shape: new RAPIER.Cuboid(width / 2 - 0.5, height / 2 - 2),
          center: { x: transform.e + width / 2, y: transform.f + height / 2 }, rotation: angle };
      });
      for (let first = 0; first < shapes.length; first += 1) for (let second = first + 1; second < shapes.length; second += 1) {
        const a = shapes[first], b = shapes[second];
        const contact = a.shape.contactShape(a.center, a.rotation, b.shape, b.center, b.rotation, 0);
        if (contact) maximumOverlap = Math.max(maximumOverlap, -contact.distance);
      }
    }
    results.push({ speed, maximumOverlap, moved: elements.map((element, index) => element.getBoundingClientRect().x - starting[index]) });
    letters.destroy();
  }
  return results;
});
console.log(JSON.stringify(results));
await page.close();
await browser.close();
assert.ok(results.every((result) => result.maximumOverlap < 1), 'Page letters must retain collision volume at slow and fast movement speeds');
assert.ok(results.every((result) => result.moved.some((distance, index) => index > 0 && distance > 2)),
  'Letters must transfer the ball movement through letter collisions');
