import { marked } from 'marked';
import type { CollectionKind } from './content';
import { entriesFor } from './content';

function header(title: string): string {
  return `
    <header class="site-header">
      <a class="site-title" href="/">Crisply2404</a>
      <a class="content-back" href="/" aria-label="Return to corridor" title="Return to corridor">↩</a>
    </header>
    <p class="reading-kicker">${title}</p>
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
      ${header(kind)}
      <main class="content-root">
        <div class="reading-column">
          <h1>${kind}</h1>
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
        ${header(kind)}
        <main class="content-root"><div class="reading-column"><h1>Not found</h1></div></main>
      </div>
    `;
  }

  return `
    <div class="site-shell">
      ${header(kind)}
      <main class="content-root">
        <article class="reading-column">${marked.parse(entry.source)}</article>
      </main>
    </div>
  `;
}

export function renderListPage(): string {
  const links = [
    { title: 'NOTES', path: '/notes/' },
    { title: 'ESSAYS', path: '/essays/' },
    { title: '击鼓传字', path: '/chuan-zi/' },
  ];

  return `
    <div class="site-shell">
      <header class="site-header">
        <a class="site-title" href="/">Crisply2404</a>
        <button class="view-toggle" data-view-toggle aria-label="Switch to game view" title="Switch to game view">◉</button>
      </header>
      <main class="list-root">
        <nav class="entry-list" aria-label="Site entrances">
          ${links
            .map(
              (link, index) => `
                <a class="entry-row" href="${link.path}">
                  <span class="entry-index">${String(index + 1).padStart(2, '0')}</span>
                  <span class="entry-title">${link.title}</span>
                  <span class="entry-path">${link.path}</span>
                </a>
              `,
            )
            .join('')}
        </nav>
      </main>
    </div>
  `;
}

