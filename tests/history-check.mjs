import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const siteUrl = process.argv[2];
const server = siteUrl ? undefined : await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const origin = siteUrl ? new URL(siteUrl).origin : 'http://127.0.0.1:4175';
try {
  for (const cached of [true, false]) {
    const browser = await chromium.launch({
      channel: 'chrome', headless: true, downloadsPath: '.work/downloads',
      ignoreDefaultArgs: cached ? ['--disable-back-forward-cache'] : [],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.historyEvents = [];
        for (const type of ['pageshow', 'pagehide']) {
          window.addEventListener(type, (event) => window.historyEvents.push({ type, persisted: event.persisted }));
        }
      });
      const camera = new THREE.OrthographicCamera(-640, 640, 400, -400, 1, 5000);
      const center = new THREE.Vector3(0, 40.01, 40);
      camera.position.copy(center).add(new THREE.Vector3(Math.sin(Math.PI / 4) * 800, 640, Math.cos(Math.PI / 4) * 800));
      camera.lookAt(center); camera.updateMatrixWorld();
      const enterDoor = async (path, x, z) => {
        await page.waitForSelector('.scene-canvas');
        await page.waitForTimeout(600);
        assert.equal(await page.locator('.scene-canvas').count(), 1);
        const point = new THREE.Vector3(x, 20, z).project(camera);
        await page.mouse.click((point.x + 1) * 640, (1 - point.y) * 400);
        await page.waitForURL(`${origin}${path}`, { waitUntil: 'commit', timeout: 8000 });
        await page.waitForSelector('.empty-state');
        assert.equal(await page.locator('.scene-canvas').count(), 0);
      };
      const returnHome = async () => {
        await page.goBack({ waitUntil: 'commit', timeout: 8000 });
        await page.waitForSelector('.scene-canvas');
        const events = await page.evaluate(() => window.historyEvents);
        assert.equal(events.at(-1).type, 'pageshow');
        assert.equal(events.at(-1).persisted, cached, JSON.stringify(events));
        assert.equal(await page.locator('.scene-canvas').count(), 1);
      };
      await page.goto(origin);
      await enterDoor('/notes/', -72, -160);
      await returnHome();
      await enterDoor('/essays/', 72, -400);
      await returnHome();
      await page.goForward({ waitUntil: 'commit', timeout: 8000 });
      await page.waitForSelector('.empty-state');
      await returnHome();
      await enterDoor('/notes/', -72, -160);
      await returnHome();
      await page.getByRole('button', { name: 'Switch to list view' }).click();
      assert.equal(await page.locator('.scene-canvas').count(), 0);
      await page.getByRole('button', { name: 'Switch to game view' }).click();
      await enterDoor('/essays/', 72, -400);
      assert.deepEqual(errors, []);
      console.log(`浏览器缓存 ${cached}：进门、后退、其他入口、前进后退循环与形态切换检查通过。`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
