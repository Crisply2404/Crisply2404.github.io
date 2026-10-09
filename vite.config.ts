import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        notFound: '404.html',
      },
    },
  },
  server: {
    port: 5174,
  },
});
