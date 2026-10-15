import { marked } from 'marked';
import type { CollectionKind } from './content';
import { entriesFor } from './content';
import { doors } from './sceneConfig';
import { githubLink } from './site-profile';

function header(): string {
  return `
    <header class="site-header">
      <a class="site-title" href="/">Crisply2404</a>
    </header>
  `;
}

export function renderCollection(kind: CollectionKind): string {
  const entries = entriesFor(kind);
  const rows = entries
    .map(
      (entry, index) => `
        <a class="entry-row" href="/${kind}/${entry.slug}">
          <span class="entry-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="entry-title">${entry.title}</span>
          <span class="entry-path">/${kind}/${entry.slug}</span>
        </a>
      `,
    )
    .join('');

  return `
    <div class="site-shell">
      ${header()}
      <main class="content-root">
        <div class="reading-column">
          <h1 class="collection-title">${kind.toUpperCase()}</h1>
          ${rows ? `<div class="entry-list">${rows}</div>` : '<p class="empty-state">No entries yet.</p>'}
        </div>
      </main>
    </div>
  `;
}

export function renderArticle(kind: CollectionKind, slug: string): string {
  const entry = entriesFor(kind).find((candidate) => candidate.slug === slug);
  if (!entry) {
    return `
      <div class="site-shell">
        ${header()}
        <main class="content-root"><div class="reading-column"><h1>Not found</h1></div></main>
      </div>
    `;
  }

  return `
    <div class="site-shell">
      ${header()}
      <main class="content-root">
        <div class="reading-column"><article>${marked.lexer(entry.source).some((token) => token.type === 'heading')
          ? '' : `<h1>${entry.title}</h1>`}${marked.parse(entry.source)}</article></div>
      </main>
    </div>
  `;
}

export function renderListPage(): string {
  return `
    <div class="site-shell">
      <header class="site-header">
        <a class="site-title" href="/">Crisply2404</a>
        <div class="header-actions">${githubLink()}
          <button class="view-toggle" data-view-toggle aria-label="Switch to game view" title="Switch to game view">◉</button>
        </div>
      </header>
      <main class="list-root">
        <nav class="entry-list entrance-list" aria-label="Site entrances">
          ${doors.filter((door) => door.group !== 'work')
            .map(
              (link) => `
                <a class="entry-row" href="${link.path}">
                  <span class="entry-title">${link.title}</span>
                </a>
              `,
            )
            .join('')}
          <button class="entry-row work-toggle" aria-expanded="false" aria-controls="work-projects">
            <span class="entry-title">Work</span>
          </button>
          <div class="work-panel" id="work-projects" inert>
            <div class="work-items">
              ${doors.filter((door) => door.group === 'work').map((door) => `
                <a class="entry-row work-project" href="${door.path}">
                  <span class="entry-title">${door.title}</span>
                </a>
              `).join('')}
            </div>
          </div>
        </nav>
      </main>
    </div>
  `;
}

