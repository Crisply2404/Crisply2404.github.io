# Deployment

## GitHub Pages

Create the public `Crisply2404/Crisply2404.github.io` repository and enable GitHub Actions as its Pages source. The workflow builds the site and publishes the artifact at `https://crisply2404.github.io/`.

Set these repository secrets:

- `CHUAN_ZI_TOKEN`: a token with read access to the private `Crisply2404/chuan-zi` repository.
- `VITE_PRESENCE_WS_URL`: the public WSS endpoint for the personal site presence relay.
- `CHUAN_ZI_WS_URL`: the public WSS endpoint used by the `chuan-zi` build.

The workflow checks out the private source into its temporary build workspace, runs its build, and copies only `dist/` into the Pages artifact at `/chuan-zi/`.

The nested local `chuan-zi/` folder has its own Git repository. The main site's `.gitignore` excludes its files; `.vscode/settings.json` tells this workspace to ignore the nested repository in Source Control. Pages builds use the committed private revision selected by the `CHUAN_ZI_REF` repository variable. Manual workflow runs can select another private branch or commit through the `chuan_zi_ref` input. Local updates must be committed and pushed to that private repository before Actions can build them.

`glyphs-source.zip` is an approved public download linked from the project's data and license page. It contains original glyph data, generated glyph JSON, licenses and two generator scripts. The `CHUAN_ZI_REF` variable selects private commit `c33eaf2e4960ea8e47b02a67d96f95f98e4c7862`, and `CHUAN_ZI_WS_URL` is configured as `wss://chuan-zi-online.tcoinsm.workers.dev/ws` so the published webpage connects to the existing game service. The original local project files remain unchanged.

The workflow listens for pushes to this site's `main` branch and manual runs. A push to the private project does not trigger this workflow. Publishing a newly selected private commit requires updating `CHUAN_ZI_REF` and running `deploy.yml`, or providing the commit through its `chuan_zi_ref` input.

## Hockey

Work links to Hockey at `/hockey/`. The local `Hockey/` directory is a separate clone of `Crisply2404/Hockey`, excluded by the main repository's `.gitignore`, VS Code repository scanning and Vite file watching. The integration preserves its source files.

Pages checks out the public repository into `hockey-source/`, installs its locked dependencies, builds with `npm run build -- --base=/hockey/`, and copies only `dist/` into the site's `dist/hockey/`. Builds use `main` by default. Set the `HOCKEY_REF` repository variable to select a revision, or supply `hockey_ref` when running `deploy.yml` manually. Hockey repository pushes become available on the next main site deployment.

The Hockey repository owns its Cloudflare lobby Worker and deploy instructions. The deployed service is `https://hockey-lobby.tcoinsm.workers.dev`; its WebSocket endpoint is `wss://hockey-lobby.tcoinsm.workers.dev/ws`. Hockey connects to this endpoint by default, so the Pages build does not require `HOCKEY_LOBBY_WS_URL`. Setting this optional secret passes a custom endpoint as `VITE_LOBBY_WS_URL`. Player names, room creation, room joining, and game input travel through the Worker.

After publishing changes to `Crisply2404/Hockey`, run the main repository's `deploy.yml` workflow to publish the selected Hockey revision under `/hockey/`.

## Presence relay

The `presence/` directory deploys a Cloudflare Worker and one SQLite-backed Durable Object. The public `/lobby` endpoint accepts WebSocket connections from the site. Hibernation keeps idle connections open. Each connection attachment stores that visitor's latest position; closing it removes the visitor. The service exposes `/health` and relays `snapshot`, `state`, and `leave` messages without writing position history.

```sh
cd presence
npm ci
npm start
```

Run the site with `VITE_PRESENCE_WS_URL=ws://localhost:8788/lobby`. Physics remains at 60 Hz, while the client publishes changing states at most every 100 milliseconds. Position changes below 0.25 world units and velocity changes below 0.1 are held until a meaningful change arrives. A reconnect immediately sends the latest state. The lobby permits bursts of up to ten messages and replenishes the allowance at 10 Hz, so network jitter preserves the final position. Excessive traffic closes that connection.

For production, log in and deploy:

```sh
cd presence
npm exec wrangler -- login
npm run check
npm run deploy
```

Use the resulting `https://crisply2404-presence.<account-subdomain>.workers.dev` origin to set the GitHub secret `VITE_PRESENCE_WS_URL` to `wss://crisply2404-presence.<account-subdomain>.workers.dev/lobby`, then run the Pages workflow. The allowed site origins and lobby binding are configured in `presence/wrangler.json`.

The deployed lobby is `wss://crisply2404-presence.tcoinsm.workers.dev/lobby`. Its health endpoint is `https://crisply2404-presence.tcoinsm.workers.dev/health`. GitHub Pages builds receive this WSS endpoint through the repository's `VITE_PRESENCE_WS_URL` secret.

After publishing, run the relay check with `PRESENCE_URL` and `SITE_ORIGIN=https://crisply2404.github.io`, and the browser check with `SITE_URL=https://crisply2404.github.io` and `PRESENCE_HEALTH_URL` pointing to the Worker's `/health` endpoint. Local validation uses the actual Workers runtime, HTTP endpoints, WebSocket clients, and two browser contexts.

