import './styles.css';
import { renderArticle, renderCollection, renderListPage } from './markdown';
import { GameScene } from './game';
import type { CollectionKind } from './content';
import type { ViewMode } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Application root is unavailable');
}
const appRoot = app;

let activeScene: GameScene | undefined;
const modeStorageKey = 'crisply2404-home-mode';

function getMode(): ViewMode {
  return localStorage.getItem(modeStorageKey) === 'list' ? 'list' : 'game';
}

function setMode(mode: ViewMode): void {
  localStorage.setItem(modeStorageKey, mode);
  renderRoute();
}

function renderHome(): void {
  activeScene?.destroy();
  activeScene = undefined;
  if (getMode() === 'list') {
    appRoot.innerHTML = renderListPage();
    appRoot.querySelector<HTMLButtonElement>('[data-view-toggle]')?.addEventListener('click', () => setMode('game'));
    return;
  }

  appRoot.innerHTML = `
    <div class="site-shell">
      <header class="site-header">
        <a class="site-title" href="/">Crisply2404</a>
        <button class="view-toggle" data-view-toggle aria-label="Switch to list view" title="Switch to list view">☷</button>
      </header>
      <main class="scene-root"></main>
      <p class="scene-controls">W A S D · SPACE · Q E · R<br />CLICK TO WALK</p>
    </div>
  `;
  appRoot.querySelector<HTMLButtonElement>('[data-view-toggle]')?.addEventListener('click', () => setMode('list'));
  const sceneRoot = appRoot.querySelector<HTMLElement>('.scene-root');
  if (!sceneRoot) throw new Error('Scene root is unavailable');
  activeScene = new GameScene(sceneRoot, (path) => {
    window.location.assign(path);
  });
}

function renderRoute(): void {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    renderHome();
    return;
  }
  const match = path.match(/^\/(notes|essays)(?:\/(.+))?$/) as RegExpMatchArray | null;
  if (match) {
    activeScene?.destroy();
    activeScene = undefined;
    const kind = match[1] as CollectionKind;
    appRoot.innerHTML = match[2] ? renderArticle(kind, match[2]) : renderCollection(kind);
    return;
  }
  activeScene?.destroy();
  activeScene = undefined;
  appRoot.innerHTML = renderCollection('notes');
}

window.addEventListener('popstate', renderRoute);
renderRoute();
