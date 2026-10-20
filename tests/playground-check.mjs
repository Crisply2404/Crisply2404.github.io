import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:5174/tests/game.html');
    await page.waitForFunction(() => window.game?.player.grounded);
    const result = await page.evaluate(async () => {
      const game = window.game;
      game.controlTutorial.dispose();
      game.player.place(game.player.pos.clone().set(440, 92.02, -80));
      const samples = [];
      for (let index = 0; index <= 32; index += 1) {
        game.targetCameraAngle = Math.PI / 4 + index * Math.PI / 16;
        game.render(1);
        const a = game.worldPlayerPosition().project(game.camera);
        if (!Number.isFinite(a.x + a.y + a.z)) throw new Error('Non-finite player projection');
        samples.push([a.x, a.y]);
      }
      const positions = game.playgroundVisual.stairs.geometry.getAttribute('position');
      return { samples, vertices: positions.count, copies: game.scene.getObjectsByProperty('name', 'PenroseStairs').length,
        blivet: game.scene.getObjectsByProperty('name', 'Blivet').length };
    });
    assert.equal(result.copies, 1); assert.equal(result.blivet, 1); assert.equal(result.vertices, 480);
    await page.screenshot({ path: `.work/screenshots/playground-${viewport.width}.png` });
    const click = async (position, object) => {
      const point = await page.evaluate(({ position, object }) => {
        const game = window.game;
        const p = game.player.pos.clone().fromArray(position);
        const surface = object === 'blivet' ? game.blivet.artToWorld(game.blivet.floorArt(p), game.cameraAngle)
          : object === 'ground' ? p.add(game.player.pos.clone().set(0, -20, 0)) : game.penrose.surfacePosition(p, game.cameraAngle);
        const screen = surface.project(game.camera);
        return { x: (screen.x + 1) * innerWidth / 2, y: (1 - screen.y) * innerHeight / 2 };
      }, { position, object });
      if (viewport.width < 500) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
    };
    await page.evaluate(() => {
      const game = window.game;
      game.targetCameraAngle = Math.PI / 4; game.cameraAngle = Math.PI / 4;
      game.player.place(game.player.pos.clone().set(440, 92.02, -80)); game.render(1);
    });
    await click([500, 92.02, -80], 'stairs');
    await page.waitForFunction(() => window.game.path.length === 0 && Math.abs(window.game.player.pos.x - 500) < 1);
    await page.evaluate(() => {
      const game = window.game;
      game.player.place(game.player.pos.clone().set(900, 40.02, 0)); game.render(1);
    });
    await click([160, 80.02, -80], 'blivet');
    await page.waitForFunction(() => window.game.inBlivet && window.game.path.length === 0 && Math.abs(window.game.player.pos.x - 160) < 2);
    await page.keyboard.down(' ');
    await page.waitForFunction(() => window.game.player.pos.y > 120);
    await page.keyboard.up(' ');
    await page.waitForFunction(() => window.game.player.grounded);
    await page.keyboard.press('Enter');
    await page.getByRole('textbox', { name: 'Message' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.game.speech.editing);
    await click([900, 40.02, 40], 'ground');
    await page.waitForFunction(() => !window.game.inBlivet && window.game.path.length === 0 && Math.abs(window.game.player.pos.x - 900) < 2);
    await click([160, 80.02, -80], 'blivet');
    await page.waitForFunction(() => window.game.inBlivet && window.game.path.length === 0);
    await page.keyboard.down('s');
    await page.waitForFunction(() => !window.game.inBlivet);
    await page.keyboard.up('s');
    await page.waitForFunction(() => window.game.player.grounded && Math.abs(window.game.player.pos.y - 40.01) < 0.1);
    await page.close();
    console.log(JSON.stringify({ viewport, vertices: result.vertices, copies: result.copies,
      rotationSamples: result.samples.length, entry: true, exit: true, jump: true, speech: true }));
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
