import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';

export default defineConfig({
  base: '/',
  plugins: [{
    name: 'article-pages',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const kind of ['notes', 'essays']) {
          const page = bundle[`${kind}/index.html`];
          if (!page || page.type !== 'asset') throw new Error(`Missing ${kind} page template`);
          for (const filename of readdirSync(`src/content/${kind}`)) {
            if (!filename.endsWith('.md')) continue;
            const slug = filename.slice(0, -3);
            this.emitFile({ type: 'asset', fileName: `${kind}/${slug}/index.html`, source: page.source });
          }
        }
      },
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        notFound: '404.html',
        notes: 'notes/index.html',
        essays: 'essays/index.html',
      },
    },
  },
  server: {
    port: 5174,
    watch: {
      ignored: ['**/chuan-zi/**', '**/Hockey/**', '**/presence/**', '**/.work/**'],
    },
  },
});
