import '../src/styles.css';
import { ControlTutorial } from '../src/mono/control-tutorial';
import { physicsReady } from '../src/mono/physics';

await physicsReady;
await document.fonts.load('600 24px "Mono Tower"');

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function runTutorialChecks(): Promise<Record<string, unknown>> {
  const root = document.querySelector<HTMLElement>('#root')!;
  const tutorial = new ControlTutorial(root);
  await Promise.all([...root.querySelectorAll<HTMLImageElement>('img')].map((image) => image.decode()));
  tutorial.update(1 / 30);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const gl = canvas.getContext('webgl2')!;
  const mobile = matchMedia('(pointer: coarse)').matches;
  const columns = mobile ? 5 : 6;
  const frames = Array.from({ length: columns }, () => new Set<number>());
  const fingerFrames = new Set<string>();
  const taps = new Set<boolean>();
  const modes = new Set<number>();
  const moveKeys = new Set<string>();
  const movementStates: string[] = [];
  let checks = 0;
  for (let tick = 0; tick < 780; tick += 1) {
    tutorial.update(1 / 60);
    if (!mobile) {
      const active = [...root.querySelectorAll<HTMLElement>('.tutorial-wasd .is-active')].map((key) => key.dataset.key!).join('');
      check(active.length === 1, 'WASD must keep one held key visible throughout each movement segment');
      movementStates.push(active);
    }
    if (tick % 6 !== 0) continue;
    modes.add([...root.querySelectorAll('.tutorial-modes i')].findIndex((dot) => dot.classList.contains('is-active')));
    fingerFrames.add([...root.querySelectorAll<HTMLElement>('.tutorial-gesture .tutorial-finger')]
      .map((finger) => finger.style.transform).join(','));
    taps.add(root.querySelector('.tutorial-tap')?.classList.contains('is-active') ?? false);
    if (mobile && root.querySelector('.tutorial-speech-tap')?.classList.contains('is-active')) {
      const finger = root.querySelector<HTMLElement>('.tutorial-speech-tap')!;
      const tipX = Math.round((parseFloat(finger.style.left) + 7) * devicePixelRatio);
      const tipY = Math.round(parseFloat(finger.style.top) * devicePixelRatio);
      const transform = new DOMMatrix(getComputedStyle(finger).transform);
      check(transform.b < -0.6 && transform.a > 0.6, 'The speech finger must approach diagonally from the lower right');
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      let outline = 0;
      for (let y = tipY - 2; y <= tipY + 2; y += 1) for (let x = tipX - 2; x <= tipX + 2; x += 1) {
        const index = ((canvas.height - 1 - y) * canvas.width + x) * 4;
        outline = Math.max(outline, data[index] ?? 0);
      }
      check(outline > 32, 'The speech finger must touch the player ball outline'); checks += 1;
    }
    for (const key of root.querySelectorAll<HTMLElement>('.tutorial-wasd .is-active')) moveKeys.add(key.dataset.key!);
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let transparent = 0, opaqueBlack = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) transparent += 1;
      if (data[index + 3] === 255 && data[index] === 0) opaqueBlack += 1;
    }
    check(transparent > canvas.width * canvas.height / 2 && opaqueBlack > 20,
      `Tutorial requires transparent space and opaque black surfaces: ${transparent}, ${opaqueBlack}`); checks += 1;
    for (let column = 0; column < columns; column += 1) {
      const left = Math.round(column * canvas.width / columns), right = Math.round((column + 1) * canvas.width / columns);
      let hash = 2166136261, pixels = 0;
      for (let y = 0; y < canvas.height; y += 1) for (let x = left; x < right; x += 1) {
        const value = data[(y * canvas.width + x) * 4];
        hash = Math.imul(hash ^ value, 16777619) >>> 0;
        if (value > 32) {
          pixels += 1;
          check(x > left + 2 && x < right - 3 && y > 2 && y < canvas.height - 3,
            `Tutorial ${column} is clipped at frame ${tick}: ${x}, ${y}`);
        }
      }
      check(pixels > 10, `Tutorial ${column} is invisible at frame ${tick}`); checks += 1;
      frames[column].add(hash);
    }
  }
  if (mobile) {
    check(fingerFrames.size > 20 && taps.size === 2, 'Mobile tutorial must animate tap, pinch and pan'); checks += 1;
    const fingers = [...root.querySelectorAll<HTMLElement>('.tutorial-finger')];
    check(fingers.length === 4 && fingers.every((finger) => {
      const style = getComputedStyle(finger);
      return style.borderTopWidth === '1px' && style.backgroundColor === 'rgb(0, 0, 0)'
        && getComputedStyle(finger, '::after').borderTopWidth === '1px';
    }), 'Mobile finger diagrams require 1px outlines and opaque interiors'); checks += 1;
  } else {
    check(modes.size === 3 && !modes.has(-1), 'Tutorial must cycle through three control modes'); checks += 1;
    check(moveKeys.size === 4, 'Tutorial must animate all WASD keys'); checks += 1;
    const heldSegments: number[] = [];
    movementStates.forEach((key, index) => {
      if (!index || key !== movementStates[index - 1]) heldSegments.push(1);
      else heldSegments[heldSegments.length - 1] += 1;
    });
    check(heldSegments.slice(0, -1).every((length) => length >= 45 && length <= 49),
      `WASD must not blink during held movement: ${heldSegments.join(', ')}`); checks += 1;
  }
  check(frames.every((samples, index) => samples.size >= (!mobile && index === 4 ? 3 : 4)),
    `Each control requires an animated game diagram: ${frames.map((samples) => samples.size).join(', ')}`); checks += 1;
  const opacity = Number(root.querySelector<HTMLElement>('.control-tutorial')!.style.opacity);
  check(opacity > 0.45 && opacity < 0.55, 'Tutorial must fade after its complete loops'); checks += 1;
  tutorial.update(1.1);
  check(root.querySelector('.control-tutorial') === null, 'Tutorial must release its elements after fading'); checks += 1;
  tutorial.update(1); tutorial.dispose();
  return { checks, mobile, modes: [...modes], moveKeys: [...moveKeys], fingerFrames: fingerFrames.size,
    frames: frames.map((samples) => samples.size) };
}

Object.assign(window, { runTutorialChecks });
