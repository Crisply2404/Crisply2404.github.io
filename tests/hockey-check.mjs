import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = process.env.SITE_URL ? undefined : await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
const origin = process.env.SITE_URL ?? 'http://127.0.0.1:4176';
const browser = await chromium.launch({ channel: 'chrome', headless: true, downloadsPath: '.work/downloads' });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 720, isMobile: viewport.width < 720 });
    const errors = [];
    const modules = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/hockey/assets/')) modules.push({ url: response.url(), status: response.status() });
    });
    await page.addInitScript(() => localStorage.setItem('crisply2404-home-mode', 'list'));
    await page.goto(origin);
    await page.waitForSelector('.entrance-ball');
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('link', { name: 'Hockey', exact: true }).click();
    await page.waitForURL(`${origin}/hockey/`);
    await page.getByText('HOCKEY — LOBBY', { exact: true }).waitFor();
    assert.equal(await page.title(), 'Hockey');
    assert.ok(modules.length > 0 && modules.every(({ status }) => status === 200), 'Hockey modules must load from their subdirectory');
    await page.getByRole('button', { name: 'Local', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 100);
    await page.waitForTimeout(400);
    const pixels = await page.locator('canvas').evaluate((canvas) => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0, light = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] < 80) dark += 1;
        if (data[index] > 180) light += 1;
      }
      return { dark, light };
    });
    assert.ok(pixels.dark > 100 && pixels.light > 100, 'The actual game must render its table and paddles');
    await page.getByRole('button', { name: 'HUMAN VS AI', exact: true }).click();
    await page.getByRole('button', { name: 'HUMAN VS HUMAN', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reset Game', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Local', exact: true }).waitFor();
    await page.reload();
    await page.getByText('HOCKEY — LOBBY', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport, pixels, modules: modules.length }));
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
console.log('Work 进入 Hockey、子目录资源、本地游戏、模式切换、返回和刷新检查通过。');
