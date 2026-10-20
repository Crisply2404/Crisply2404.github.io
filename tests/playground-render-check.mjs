import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5174/tests/game.html');
  await page.waitForFunction(() => window.game?.player.grounded);
  const result = await page.evaluate(async () => {
    const game = window.game;
    const svg = new DOMParser().parseFromString(await (await fetch('/src/mono/assets/blivet.svg')).text(), 'image/svg+xml');
    svg.documentElement.setAttribute('viewBox', '0 -260 520 260');
    svg.documentElement.setAttribute('width', '520'); svg.documentElement.setAttribute('height', '260');
    const group = svg.querySelector('g');
    group.setAttribute('stroke-width', '25'); group.setAttribute('stroke-linecap', 'round'); group.setAttribute('stroke-linejoin', 'round');
    const width = game.canvas.width, height = game.canvas.height;
    svg.documentElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.documentElement.setAttribute('width', String(width)); svg.documentElement.setAttribute('height', String(height));
    const outer = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.replaceWith(outer); outer.append(group);
    const reference = document.createElement('canvas'); reference.width = width; reference.height = height;
    const context = reference.getContext('2d');
    const gl = game.rendering.renderer.getContext();
    const pixels = new Uint8Array(width * height * 4);
    let maxBlivetError = 0, minimumOutlineSamples = 72, minimumCurveCoverage = 1, maxEnergyDifference = 0;
    for (let index = 0; index < 16; index += 1) {
      const angle = index * Math.PI / 8;
      game.playgroundVisual.update(angle);
      const center = game.blivet.artToWorld({ x: 260, y: 140 }, angle);
      game.camera.position.set(center.x + Math.sin(angle) * 800, center.y + 640, center.z + Math.cos(angle) * 800);
      game.camera.lookAt(center); game.camera.updateMatrixWorld();
      const isolated = new game.scene.constructor();
      isolated.add(game.playgroundVisual.blivet.clone(), game.playgroundVisual.getObjectByName('BlivetEdges').clone());
      game.rendering.render(isolated, game.camera);
      for (const y of [60, 100, 140, 180, 220]) {
        const screen = game.blivet.artToWorld({ x: 200, y }, angle).project(game.camera);
        const ray = game.screenRay({ x: (screen.x + 1) * innerWidth / 2, y: (1 - screen.y) * innerHeight / 2 });
        const opaque = ray.intersectObject(game.playgroundVisual.blivet).length > 0;
        if (opaque !== [60, 140, 220].includes(y)) throw new Error('Blivet cylinder gaps have incorrect occlusion');
      }
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      context.clearRect(0, 0, width, height);
      const topLeft = game.blivet.artToWorld({ x: 0, y: 260 }, angle).project(game.camera);
      const scale = height * game.camera.zoom / (game.camera.top - game.camera.bottom);
      const tilt = game.blivet.artAngle;
      outer.setAttribute('transform', `matrix(${scale * Math.cos(tilt)},${-scale * Math.sin(tilt)},${scale * Math.sin(tilt)},${scale * Math.cos(tilt)},${(topLeft.x + 1) * width / 2 + 260 * scale * Math.sin(tilt)},${(1 - topLeft.y) * height / 2 + 260 * scale * Math.cos(tilt)})`);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      const image = new Image(); image.src = url; await image.decode(); URL.revokeObjectURL(url);
      context.drawImage(image, 0, 0);
      const expected = context.getImageData(0, 0, width, height).data;
      let error = 0, energy = 0, actualEnergy = 0, expectedCount = 0, actualCount = 0, expectedMatch = 0, actualMatch = 0;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const wanted = expected[(y * width + x) * 4 + 3];
        const actual = pixels[((height - 1 - y) * width + x) * 4];
        energy += wanted; actualEnergy += actual; error += Math.abs(wanted - actual);
        if (wanted > 32) expectedCount += 1;
        if (actual > 32) actualCount += 1;
        if (wanted > 32 || actual > 32) {
          let expectedNear = false, actualNear = false;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            const px = x + dx, py = y + dy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            expectedNear ||= expected[(py * width + px) * 4 + 3] > 32;
            actualNear ||= pixels[((height - 1 - py) * width + px) * 4] > 32;
          }
          if (wanted > 32 && actualNear) expectedMatch += 1;
          if (actual > 32 && expectedNear) actualMatch += 1;
        }
      }
      if (!energy) throw new Error('Blivet reference contains no visible strokes');
      maxBlivetError = Math.max(maxBlivetError, error / energy);
      minimumCurveCoverage = Math.min(minimumCurveCoverage, expectedMatch / expectedCount, actualMatch / actualCount);
      maxEnergyDifference = Math.max(maxEnergyDifference, Math.abs(actualEnergy / energy - 1));
      for (const [x, z] of [[440, -79], [441, -80], [440, -40], [600, 0], [520, 80]]) {
        game.player.place(game.player.pos.clone().set(x, 92.02, z));
        game.targetCameraAngle = angle; game.cameraAngle = angle; game.render(1);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const p = game.worldPlayerPosition().project(game.camera);
        const cx = (p.x + 1) * width / 2, cy = (p.y + 1) * height / 2;
        const radius = 20 * height * game.camera.zoom / (game.camera.top - game.camera.bottom);
        let visible = 0;
        for (let sample = 0; sample < 72; sample += 1) {
          const theta = sample * Math.PI / 36;
          const px = Math.round(cx + Math.cos(theta) * radius), py = Math.round(cy + Math.sin(theta) * radius);
          let brightness = 0;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            brightness = Math.max(brightness, pixels[((py + dy) * width + px + dx) * 4]);
          }
          if (brightness > 80) visible += 1;
        }
        minimumOutlineSamples = Math.min(minimumOutlineSamples, visible);
      }
    }
    return { maxBlivetError, minimumCurveCoverage, maxEnergyDifference, minimumOutlineSamples, rotationSamples: 16, ballPositions: 80 };
  });
  console.log(JSON.stringify(result));
  assert.ok(result.minimumCurveCoverage > 0.99, 'Blivet geometry differs from the classic SVG reference by more than one pixel');
  assert.ok(result.maxEnergyDifference < 0.02, 'Blivet stroke coverage differs from the classic SVG reference');
  assert.equal(result.minimumOutlineSamples, 72, 'Penrose seam unexpectedly hides the ball outline');
} finally {
  await browser.close();
}
