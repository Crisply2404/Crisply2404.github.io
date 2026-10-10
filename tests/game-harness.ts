import '../src/styles.css';
import { GameScene } from '../src/game';
import { physicsReady } from '../src/mono/physics';
await physicsReady;
await document.fonts.load('600 64px "Mono Tower"');
const routes: string[] = [];
const game = new GameScene(document.querySelector<HTMLElement>('#root')!, (path) => routes.push(path));
Object.assign(window, { game, routes });
