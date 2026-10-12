# Deployment

## GitHub Pages

Create the public `Crisply2404/Crisply2404.github.io` repository and enable GitHub Actions as its Pages source. The workflow builds the site and publishes the artifact at `https://crisply2404.github.io/`.

Set these repository secrets:

- `CHUAN_ZI_TOKEN`: a token with read access to the private `Crisply2404/chuan-zi` repository.
- `VITE_PRESENCE_WS_URL`: the public WSS endpoint for the personal site presence relay.
- `CHUAN_ZI_WS_URL`: the public WSS endpoint used by the `chuan-zi` build.

The workflow checks out the private source into its temporary build workspace, runs its build, and copies only `dist/` into the Pages artifact at `/chuan-zi/`.

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

After publishing, run the relay check with `PRESENCE_URL` and `SITE_ORIGIN=https://crisply2404.github.io`, and the browser check with `SITE_URL=https://crisply2404.github.io` and `PRESENCE_HEALTH_URL` pointing to the Worker's `/health` endpoint. Local validation uses the actual Workers runtime, HTTP endpoints, WebSocket clients, and two browser contexts.

