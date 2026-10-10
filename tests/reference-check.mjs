import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5174/tests/render.html');
await page.waitForFunction(() => typeof window.referencePixels === 'function');
const results = [];
for (const name of ['circle', 'stroke-0', 'stroke-1', 'stroke-2', 'gate-0', 'gate-1', 'number-0', 'number-1', 'contact', 'checkpoint-0', 'checkpoint-1', 'blocks']) {
  const source = PNG.sync.read(await fs.readFile(`tests/fixtures/mono-tower/${name}.png`));
  assert.equal(source.width, 1280); assert.equal(source.height, 800);
  const actual = await page.evaluate((name) => window.referencePixels(name), name);
  let totalError = 0, sourceEnergy = 0, actualEnergy = 0, overlap = 0, union = 0, cursor = 0;
  for (let y = 250; y < 550; y += 1) for (let x = 440; x < 840; x += 1) {
    const expected = source.data[(y * source.width + x) * 4], value = actual[cursor++];
    totalError += Math.abs(expected - value); sourceEnergy += expected; actualEnergy += value;
    if (Math.max(expected, value) > 32) { union += 1; if (Math.min(expected, value) > 32) overlap += 1; }
  }
  const result = { name, relativeError: totalError / sourceEnergy, energyRatio: actualEnergy / sourceEnergy, overlap: overlap / union };
  results.push(result); console.log(JSON.stringify(result));
  assert.ok(sourceEnergy > 0);
  assert.ok(result.relativeError < 0.02, `${name} pixels differ from Godot`);
  assert.ok(result.energyRatio > 0.98 && result.energyRatio < 1.02, `${name} brightness differs from Godot`);
  assert.ok(result.overlap > 0.98, `${name} geometry differs from Godot`);
}
for (const orientation of [0, 1, 2]) {
  const source = PNG.sync.read(await fs.readFile(`tests/fixtures/mono-tower/preview-${orientation}.png`));
  const actual = await page.evaluate((orientation) => window.previewPixels(orientation), orientation);
  assert.equal(actual.width, source.width);
  assert.equal(actual.height, source.height);
  let error = 0, energy = 0;
  for (let index = 0; index < actual.data.length; index += 1) {
    const expected = source.data[index * 4];
    energy += expected; error += Math.abs(actual.data[index] - expected);
  }
  const result = { name: `preview-${orientation}`, relativeError: error / energy };
  results.push(result); console.log(JSON.stringify(result));
  assert.ok(energy > 0);
  assert.ok(result.relativeError < 0.02, `Direction preview ${orientation} differs from Godot`);
}
await fs.writeFile('.work/reference-results.json', JSON.stringify(results, null, 2));
await browser.close();
