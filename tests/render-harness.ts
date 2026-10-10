import * as THREE from 'three';
import { VisualBuilder } from '../src/mono/objects';
import { MonoRenderer } from '../src/mono/renderer';
import { CONFIG } from '../src/mono/config';
import { ControlPreview } from '../src/mono/control-preview';
import { NavigationRipple } from '../src/mono/navigation-ripple';
import '../src/styles.css';

await document.fonts.load('600 64px "Mono Tower"');

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const rendering = new MonoRenderer(canvas);
const builder = new VisualBuilder(rendering);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-640, 640, 400, -400, 1, 5000);

function capture(): { data: Uint8Array; width: number; height: number } {
  rendering.render(scene, camera);
  const gl = rendering.renderer.getContext();
  const width = canvas.width, height = canvas.height;
  const data = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { data, width, height };
}

function project(point: THREE.Vector3): THREE.Vector2 {
  const position = point.clone().project(camera);
  return new THREE.Vector2((position.x + 1) * canvas.width / 2, (position.y + 1) * canvas.height / 2);
}

function pixel(image: ReturnType<typeof capture>, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  return image.data[(Math.floor(y) * image.width + Math.floor(x)) * 4] / 255;
}

function brightness(image: ReturnType<typeof capture>, point: THREE.Vector2, reach = 2): number {
  let maximum = 0;
  for (let y = Math.floor(point.y) - reach; y <= Math.ceil(point.y) + reach; y += 1)
    for (let x = Math.floor(point.x) - reach; x <= Math.ceil(point.x) + reach; x += 1) maximum = Math.max(maximum, pixel(image, x, y));
  return maximum;
}

function check(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

function strokeWidth(image: ReturnType<typeof capture>, start: THREE.Vector2, end: THREE.Vector2): number {
  const length = start.distanceTo(end);
  const tangent = end.clone().sub(start).normalize();
  const padding = 8;
  let coverage = 0;
  for (let y = Math.floor(Math.min(start.y, end.y)) - padding; y <= Math.ceil(Math.max(start.y, end.y)) + padding; y += 1) {
    for (let x = Math.floor(Math.min(start.x, end.x)) - padding; x <= Math.ceil(Math.max(start.x, end.x)) + padding; x += 1) {
      const offsetX = x + 0.5 - start.x;
      const offsetY = y + 0.5 - start.y;
      const along = offsetX * tangent.x + offsetY * tangent.y;
      if (along >= padding && along <= length - padding) coverage += pixel(image, x, y);
    }
  }
  return coverage / (length - padding * 2);
}

async function run(): Promise<Record<string, unknown>> {
  let checks = 0;
  const widths: number[] = [];
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    rendering.resize(width, height);
    const frustum = width < height ? 1000 / (width / height) : 800;
    camera.left = -frustum * width / height / 2; camera.right = -camera.left;
    camera.top = frustum / 2; camera.bottom = -camera.top; camera.updateProjectionMatrix();
    for (let view = 0; view < 4; view += 1) {
      const angle = Math.PI / 4 + view * Math.PI / 2;
      camera.position.set(Math.sin(angle) * 800, 640, Math.cos(angle) * 800); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      scene.clear();
      for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
        scene.clear();
        const start = direction.clone().multiplyScalar(-100), end = direction.clone().multiplyScalar(100);
        const stroke = builder.createStroke([[start, end]]); scene.add(stroke);
        const image = capture(), a = project(start), b = project(end);
        const sum = strokeWidth(image, a, b);
        const expected = CONFIG.thickness * canvas.height / frustum;
        check(Math.abs(sum - expected) < Math.max(0.06, expected * 0.035), `Line width ${sum} expected ${expected}`); checks += 1; widths.push(sum);
        scene.add(stroke.clone());
        const duplicate = capture();
        check(image.data.every((value, index) => value === duplicate.data[index]), 'Duplicate strokes changed brightness'); checks += 1;
      }
      scene.clear();
      const player = builder.createPlayerMesh(); scene.add(player);
      const baseline = capture(), center = project(new THREE.Vector3());
      check(pixel(baseline, center.x, center.y) < 0.01, 'Player fill must be black'); checks += 1;
      const radius = 20 * canvas.height / frustum;
      let circlePixels = 0;
      for (let angleIndex = 0; angleIndex < 64; angleIndex += 1) {
        const angle = angleIndex * Math.PI / 32;
        circlePixels += brightness(baseline, center.clone().add(new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(radius)), 1) > 0.25 ? 1 : 0;
      }
      check(circlePixels === 64, `Circle outline missing ${64 - circlePixels} samples`); checks += 1;
      const occluder = new THREE.Mesh(new THREE.BoxGeometry(120, 120, 120), builder.materialBlack);
      occluder.quaternion.copy(camera.quaternion); occluder.position.copy(new THREE.Vector3(0, 0, 140).applyQuaternion(camera.quaternion)); scene.add(occluder);
      const foreground = capture();
      check(foreground.data.every((value, index) => index % 4 === 3 || value === 0), 'Foreground failed to hide player'); checks += 1;
      occluder.position.multiplyScalar(-1); const behind = capture();
      check(baseline.data.every((value, index) => value === behind.data[index]), 'Background hid player outline'); checks += 1;
      scene.remove(occluder);
      const rearLine = builder.createStroke([[
        new THREE.Vector3(-10, 0, -30).applyQuaternion(camera.quaternion),
        new THREE.Vector3(10, 0, -30).applyQuaternion(camera.quaternion),
      ]]);
      scene.add(rearLine);
      const opaqueBall = capture();
      check(baseline.data.every((value, index) => value === opaqueBall.data[index]), `Player failed to hide background line at ${width}x${height} view ${view}; center ${pixel(opaqueBall, center.x, center.y)}`); checks += 1;
      scene.clear();
      const checkpoint = builder.createCheckpoint(new THREE.Vector3(0, 19.2, 0));
      scene.add(checkpoint); checkpoint.update(camera, [], 0, canvas.height);
      const inactive = capture();
      const graphic = checkpoint.getObjectByName('FlagGraphic')!;
      const tip = project(graphic.localToWorld(new THREE.Vector3(17, 25, 0)));
      check(brightness(inactive, tip) > 0.2, 'Flag tip is absent'); checks += 1;
      checkpoint.setActive(true); checkpoint.update(camera, [], 0.3, canvas.height);
      const active = capture(), interior = project(graphic.localToWorld(new THREE.Vector3(17 / 3, 74 / 3, 0)));
      check(brightness(active, interior, 0) > 0.5, 'Active flag is not filled'); checks += 1;
      scene.add(player); player.position.copy(graphic.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 25, 0)).add(new THREE.Vector3(0, 0, 40).applyQuaternion(camera.quaternion));
      checkpoint.update(camera, [player], 0, canvas.height);
      check(checkpoint.hiddenByPlayer && !graphic.visible && !checkpoint.getObjectByName('FlagMask')!.visible, 'Whole flag occlusion failed'); checks += 1;
      scene.clear();
      for (const completed of [false, true]) {
        const gate = builder.createGate('01', new THREE.Vector3(), 0, completed); scene.add(gate); capture();
        await builder.ready();
        capture();
        check(gate.getObjectByName(completed ? 'CompletedInterior' : 'WhiteEdges') !== undefined, 'Gate variant absent'); checks += 1;
        scene.remove(gate);
      }
      const geometry = builder.createLevelMesh([{ gx: 0, gy: 0, gz: 0, type: 'standard' }, { gx: 2, gy: 0, gz: 0, type: 'spike' }]);
      scene.add(geometry); const objects = capture();
      check(objects.data.some((value, index) => index % 4 !== 3 && value > 128), 'Block and spike invisible'); checks += 1;
      scene.clear();
    }
  }
  const exit = builder.createGate('', new THREE.Vector3()); scene.add(exit); capture();
  await builder.ready();
  capture();
  check(exit.getObjectByName('ExitSignFront') !== undefined && exit.getObjectByName('ExitSignBack') !== undefined, 'Double-sided exit signs absent'); checks += 1;
  return { checks, widths };
}

async function runSiteChecks(): Promise<Record<string, unknown>> {
  rendering.resize(1280, 800);
  camera.left = -640; camera.right = 640; camera.top = 400; camera.bottom = -400; camera.updateProjectionMatrix();
  camera.position.set(0, 640, 800); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  let checks = 0;
  scene.clear();
  const gate = builder.createSiteGate(new THREE.Vector3(0, 20, 0), 0, '击鼓传字');
  gate.quaternion.copy(camera.quaternion); scene.add(gate);
  const baseline = capture();
  const rearLine = builder.createStroke([[
    new THREE.Vector3(-20, 36, -40).applyQuaternion(camera.quaternion),
    new THREE.Vector3(20, 36, -40).applyQuaternion(camera.quaternion),
  ]]);
  scene.add(rearLine);
  const occluded = capture();
  check(baseline.data.every((value, index) => value === occluded.data[index]), 'Door interior failed to hide background line'); checks += 1;
  scene.clear();
  const exit = builder.createSiteGate(new THREE.Vector3(0, 20, 0));
  const graphic = exit.getObjectByName('ExitGraphic') as THREE.Mesh;
  scene.add(graphic); await builder.ready();
  const white = new THREE.Mesh(new THREE.PlaneGeometry(100, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  white.position.set(0, 90, -2); scene.add(white);
  const transparent = capture();
  check(brightness(transparent, project(new THREE.Vector3(-30, 104, 0)), 0) > 0.9, 'Exit graphic background must be transparent'); checks += 1;
  scene.clear();
  const ripple = new NavigationRipple([{ gx: 0, gy: 0, gz: 0, type: 'standard' }]);
  scene.add(ripple); ripple.show(new THREE.Vector3(16, 20, 0)); ripple.update(0.335);
  const rippleImage = capture();
  check(brightness(rippleImage, project(new THREE.Vector3(-4, 20.05, 0)), 1) > 0.1, 'Ripple is missing on the block surface'); checks += 1;
  check(brightness(rippleImage, project(new THREE.Vector3(36, 20.05, 0)), 1) === 0, 'Ripple escaped the block surface'); checks += 1;
  ripple.update(1); check(!ripple.visible, 'Ripple did not finish'); checks += 1;
  scene.clear();
  const broadRipple = new NavigationRipple(Array.from({ length: 9 }, (_, index) => ({ gx: index % 3 - 1, gy: 0, gz: Math.floor(index / 3) - 1, type: 'standard' as const })));
  scene.add(broadRipple); broadRipple.show(new THREE.Vector3(0, 20, 0)); broadRipple.update(0.335);
  const broad = capture(), opacity = 1 - 0.335 / 0.65, radius = 3 + 33 * 0.335 / 0.65;
  const widths: number[] = [];
  for (const axis of ['x', 'z'] as const) {
    const point = new THREE.Vector3(0, 20.05, 0); point[axis] = radius;
    const center = project(point);
    let energy = 0;
    const horizontal = axis === 'x';
    for (let offset = -8 * devicePixelRatio; offset <= 8 * devicePixelRatio; offset += 1) {
      energy += pixel(broad, center.x + (horizontal ? offset : 0), center.y + (horizontal ? 0 : offset));
    }
    const width = energy / opacity;
    widths.push(width);
    check(Math.abs(width - CONFIG.thickness * devicePixelRatio) < 0.3 * devicePixelRatio, `Ripple ${axis} width ${width}`); checks += 1;
  }
  scene.clear();
  return { checks, rippleWidths: widths };
}

async function referencePixels(name: string): Promise<number[]> {
  rendering.resize(1280, 800);
  camera.left = -640; camera.right = 640; camera.top = 400; camera.bottom = -400; camera.updateProjectionMatrix();
  camera.position.set(Math.sin(Math.PI / 4) * 800, 640, Math.cos(Math.PI / 4) * 800); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  scene.clear();
  if (name === 'circle') scene.add(builder.createPlayerMesh());
  else if (name.startsWith('stroke-')) {
    const direction = new THREE.Vector3().setComponent(Number(name.at(-1)), 1);
    scene.add(builder.createStroke([[direction.clone().multiplyScalar(-100), direction.clone().multiplyScalar(100)]]));
  } else if (name.startsWith('gate-')) scene.add(builder.createGate('', new THREE.Vector3(), 0, name.endsWith('1')));
  else if (name.startsWith('number-')) scene.add(builder.createGate('01', new THREE.Vector3(), 0, name.endsWith('1')));
  else if (name === 'contact') {
    const contact = builder.createContactMarker(); contact.scale.setScalar(0.3); scene.add(contact);
  }
  else if (name.startsWith('checkpoint-')) {
    const checkpoint = builder.createCheckpoint(new THREE.Vector3(0, 19.2, 0)); scene.add(checkpoint);
    checkpoint.setActive(name.endsWith('1')); checkpoint.update(camera, [], 0.3, 800);
  } else if (name === 'blocks') scene.add(builder.createLevelMesh([{ gx: 0, gy: 0, gz: 0, type: 'standard' }, { gx: 2, gy: 0, gz: 0, type: 'spike' }]));
  else throw new Error('Unknown reference case');
  await builder.ready();
  const image = capture();
  const output: number[] = [];
  for (let y = 250; y < 550; y += 1) for (let x = 440; x < 840; x += 1) output.push(image.data[((image.height - 1 - y) * image.width + x) * 4]);
  return output;
}

function previewPixels(orientation: 0 | 1 | 2): { width: number; height: number; data: number[] } {
  const root = document.createElement('div');
  document.body.append(root);
  const preview = new ControlPreview(root);
  camera.left = -640; camera.right = 640; camera.top = 400; camera.bottom = -400; camera.updateProjectionMatrix();
  camera.position.set(Math.sin(Math.PI / 4) * 800, 640, Math.cos(Math.PI / 4) * 800);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  preview.show(orientation);
  preview.update(camera, Math.PI / 4, 0, 800);
  const canvas = root.querySelector('canvas')!;
  const gl = canvas.getContext('webgl2')!;
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const output = [];
  for (let y = canvas.height - 1; y >= 0; y -= 1) for (let x = 0; x < canvas.width; x += 1) output.push(data[(y * canvas.width + x) * 4]);
  const result = { width: canvas.width, height: canvas.height, data: output };
  preview.dispose(); root.remove();
  return result;
}

Object.assign(window, { runRenderChecks: run, runSiteChecks, referencePixels, previewPixels });
