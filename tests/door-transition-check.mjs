import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
try {
  for (const touch of [false, true]) {
    for (const door of [{ path: '/notes/', x: -72, z: -160 }, { path: '/essays/', x: 72, z: -400 },
      { path: '/chuan-zi/', x: -72, z: -640 }, { path: '/hockey/', x: 72, z: -880 }]) {
      const page = await browser.newPage({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://localhost:5174/tests/game.html');
      await page.waitForFunction(() => window.game?.player.grounded);
      const clickWorld = async (x, z) => {
        const point = await page.evaluate(({ x, z }) => {
          const game = window.game;
          const projected = game.player.pos.clone().set(x, 20, z).project(game.camera);
          return { x: (projected.x + 1) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2 };
        }, { x, z });
        if (touch) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
      };
      if (touch || door.path === '/hockey/') {
        let approachZ = 40;
        while (approachZ - door.z > 200) {
          approachZ -= 160;
          await clickWorld(0, approachZ);
          await page.waitForFunction((z) => Math.abs(window.game.player.pos.z - z) < 1 && window.game.path.length === 0, approachZ);
        }
      }
      const heldEntry = !touch && door.path === '/notes/';
      if (heldEntry) {
        await clickWorld(0, door.z);
        await page.waitForFunction((z) => Math.abs(window.game.player.pos.z - z) < 1 && window.game.path.length === 0, door.z);
        await page.keyboard.down('w'); await page.keyboard.down('a');
      } else await clickWorld(door.x, door.z);
      const stopped = await page.evaluate(() => new Promise((resolve, reject) => {
        const deadline = performance.now() + 10000;
        const observe = () => {
          if (performance.now() > deadline) { reject(new Error('Door was not entered within ten seconds')); return; }
          if (!window.routes.length) { requestAnimationFrame(observe); return; }
          const game = window.game;
          resolve({ position: game.player.pos.toArray(), velocity: game.player.vel.toArray() });
        };
        observe();
      }));
      assert.deepEqual(stopped.velocity, [0, 0, 0], 'The ball must stop in the frame that triggers the door');
      const stayStopped = async () => {
        const positions = await page.evaluate(() => new Promise((resolve) => {
          const samples = [];
          const observe = () => {
            samples.push(window.game.player.pos.toArray());
            if (samples.length === 15) resolve(samples);
            else requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        }));
        for (const position of positions) assert.deepEqual(position, stopped.position, 'Input must leave the entering ball stationary');
      };
      await stayStopped();
      if (heldEntry) { await page.keyboard.up('w'); await page.keyboard.up('a'); }
      for (const key of ['w', 'a', 's', 'd', ' ', 'r', 'q', 'e', 'Tab']) {
        await page.keyboard.down(key);
        await stayStopped();
        await page.keyboard.up(key);
      }
      await clickWorld(0, door.z + 80);
      await stayStopped();
      if (touch) {
        for (const action of ['jump', 'rotateLeft', 'rotateRight']) {
          const button = await page.getByRole('button', { name: action, exact: true }).boundingBox();
          await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
          await stayStopped();
        }
      }
      assert.deepEqual(await page.evaluate(() => window.routes), [door.path]);
      assert.deepEqual(errors, []);
      console.log(`${touch ? '手机' : '桌面'} ${door.path}：触发当帧停止与持续输入检查通过。`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
