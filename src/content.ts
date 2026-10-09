import { marked } from 'marked';

export type CollectionKind = 'notes' | 'essays';

interface ContentEntry {
  slug: string;
  source: string;
  title: string;
}

const noteModules = import.meta.glob('./content/notes/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const essayModules = import.meta.glob('./content/essays/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

function slugFromPath(path: string): string {
  const filename = path.split('/').at(-1) ?? '';
  return filename.replace(/\.md$/, '');
}

function titleFromMarkdown(source: string, slug: string): string {
  const heading = marked.lexer(source).find((token) => token.type === 'heading');
  return heading?.type === 'heading' ? heading.text : slug;
}

function modulesFor(kind: CollectionKind): Record<string, string> {
  return kind === 'notes' ? noteModules : essayModules;
}

export function entriesFor(kind: CollectionKind): ContentEntry[] {
  return Object.entries(modulesFor(kind))
    .map(([path, source]) => {
      const slug = slugFromPath(path);
      return { slug, source, title: titleFromMarkdown(source, slug) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function entryFor(kind: CollectionKind, slug: string): ContentEntry | undefined {
  return entriesFor(kind).find((entry) => entry.slug === slug);
}

