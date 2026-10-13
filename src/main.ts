import './styles.css';
import { renderArticle, renderCollection, renderListPage } from './markdown';
import type { GameScene } from './game';
import type { EntranceBall } from './entrance-ball';
import type { CollectionKind } from './content';
import type { ViewMode } from './types';
import { resetPagePlayState } from './page-play-state';
import { ViewToggleHint } from './view-toggle-hint';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Application root is unavailable');
}
const appRoot = app;

let activeScene: GameScene | undefined;
let activeEntrances: EntranceBall | undefined;
let toggleHint: ViewToggleHint | undefined;
let routeGeneration = 0;
const modeStorageKey = 'crisply2404-home-mode';

function getMode(): ViewMode {
  return localStorage.getItem(modeStorageKey) === 'list' ? 'list' : 'game';
}

function setMode(mode: ViewMode): void {
  localStorage.setItem(modeStorageKey, mode);
  renderRoute();
}

function disposeScene(): void {
  toggleHint?.destroy();
  toggleHint = undefined;
  activeScene?.destroy();
  activeScene = undefined;
  activeEntrances?.destroy();
  activeEntrances = undefined;
}

async function renderHome(): Promise<void> {
  const generation = ++routeGeneration;
  disposeScene();
  if (getMode() === 'list') {
    appRoot.innerHTML = renderListPage();
    appRoot.querySelector<HTMLButtonElement>('[data-view-toggle]')?.addEventListener('click', () => setMode('game'));
    const [{ EntranceBall, pagePhysicsReady }, { physicsReady }] = await Promise.all([import('./entrance-ball'), import('./mono/physics')]);
    await Promise.all([physicsReady, pagePhysicsReady]);
    if (generation !== routeGeneration) return;
    const entrances = appRoot.querySelector<HTMLElement>('.entrance-list');
    if (!entrances) throw new Error('Site entrances are unavailable');
    activeEntrances = new EntranceBall(entrances);
    return;
  }

  appRoot.innerHTML = `
    <div class="site-shell">
      <header class="site-header game-header">
        <a class="site-title" href="/">Crisply2404</a>
        <button class="view-toggle" data-view-toggle aria-label="Switch to list view" title="Switch to list view">☷</button>
      </header>
      <main class="scene-root"></main>
    </div>
  `;
  const toggle = appRoot.querySelector<HTMLButtonElement>('[data-view-toggle]')!;
  toggleHint = new ViewToggleHint(toggle);
  toggle.addEventListener('click', () => setMode('list'));
  const sceneRoot = appRoot.querySelector<HTMLElement>('.scene-root');
  if (!sceneRoot) throw new Error('Scene root is unavailable');
  const [{ GameScene }, { physicsReady }] = await Promise.all([import('./game'), import('./mono/physics')]);
  await physicsReady;
  await document.fonts.load('600 64px "Mono Tower"');
  if (generation !== routeGeneration) return;
  activeScene = new GameScene(sceneRoot, (path) => {
    window.location.assign(path);
  });
}

function renderRoute(): void {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    void renderHome();
    return;
  }
  const match = path.match(/^\/(notes|essays)(?:\/(.+))?$/) as RegExpMatchArray | null;
  routeGeneration += 1;
  if (match) {
    disposeScene();
    const kind = match[1] as CollectionKind;
    appRoot.innerHTML = match[2] ? renderArticle(kind, match[2]) : renderCollection(kind);
    void installPagePlay(routeGeneration);
    return;
  }
  disposeScene();
  appRoot.innerHTML = renderCollection('notes');
  void installPagePlay(routeGeneration);
}

async function installPagePlay(generation: number): Promise<void> {
  const [{ EntranceBall, pagePhysicsReady }, { physicsReady }] = await Promise.all([import('./entrance-ball'), import('./mono/physics')]);
  await Promise.all([physicsReady, pagePhysicsReady]);
  await document.fonts.ready;
  if (generation !== routeGeneration) return;
  const root = appRoot.querySelector<HTMLElement>('.reading-column');
  if (!root) throw new Error('Reading page is unavailable');
  activeEntrances = new EntranceBall(root);
}

function renderHistoryPage(): void {
  disposeScene();
  resetPagePlayState();
  renderRoute();
}

window.addEventListener('popstate', renderHistoryPage);
window.addEventListener('pagehide', () => {
  routeGeneration += 1;
  disposeScene();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) renderHistoryPage();
});
renderRoute();
