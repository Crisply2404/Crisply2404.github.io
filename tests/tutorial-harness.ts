import '../src/styles.css';
import { ControlTutorial } from '../src/mono/control-tutorial';
import { physicsReady } from '../src/mono/physics';

await physicsReady;
await document.fonts.load('600 24px "Mono Tower"');

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTutorialChecks(): Record<string, unknown> {
  const root = document.querySelector<HTMLElement>('#root')!;
  const tutorial = new ControlTutorial(root);
  tutorial.update(1 / 30);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const gl = canvas.getContext('webgl2')!;
  const frames = Array.from({ length: 5 }, () => new Set<number>());
  const modes = new Set<number>();
  const moveKeys = new Set<string>();
  let checks = 0;
  for (let tick = 0; tick < 780; tick += 1) {
    tutorial.update(1 / 60);
    if (tick % 6 !== 0) continue;
    modes.add([...root.querySelectorAll('.tutorial-modes i')].findIndex((dot) => dot.classList.contains('is-active')));
    for (const key of root.querySelectorAll<HTMLElement>('.tutorial-wasd .is-active')) moveKeys.add(key.dataset.key!);
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (let column = 0; column < 5; column += 1) {
      const left = Math.round(column * canvas.width / 5), right = Math.round((column + 1) * canvas.width / 5);
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
  check(modes.size === 3 && !modes.has(-1), 'Tutorial must cycle through three control modes'); checks += 1;
  check(moveKeys.size === 4, 'Tutorial must animate all WASD keys'); checks += 1;
  check(frames.every((samples, index) => samples.size >= (index === 3 ? 3 : 4)),
    `Each control requires an animated game diagram: ${frames.map((samples) => samples.size).join(', ')}`); checks += 1;
  const opacity = Number(root.querySelector<HTMLElement>('.control-tutorial')!.style.opacity);
  check(opacity > 0.45 && opacity < 0.55, 'Tutorial must fade after its complete loops'); checks += 1;
  tutorial.update(1.1);
  check(root.querySelector('.control-tutorial') === null, 'Tutorial must release its elements after fading'); checks += 1;
  tutorial.update(1); tutorial.dispose();
  return { checks, modes: [...modes], moveKeys: [...moveKeys], frames: frames.map((samples) => samples.size) };
}

Object.assign(window, { runTutorialChecks });
