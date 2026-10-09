# Crisply2404

The homepage is a Three.js corridor inspired by `mono-tower`. It has a Game view with a local ball and temporary visitor balls, plus a List view that exposes the same entrances as a readable page.

## Local development

```sh
npm ci
npm run dev
```

Set `VITE_PRESENCE_WS_URL` to an available WSS endpoint when testing visitor presence. Without it, the local ball and doors remain usable.

## Content

Add Markdown files to `src/content/notes/` or `src/content/essays/`. The collection page and article route are generated during the Vite build.

## Deployment

The Pages workflow creates the public site and builds the private `Crisply2404/chuan-zi` repository into `/chuan-zi/`. Configure `CHUAN_ZI_TOKEN`, `VITE_PRESENCE_WS_URL`, and `CHUAN_ZI_WS_URL` in the public repository secrets. The token needs read access to the private repository.

