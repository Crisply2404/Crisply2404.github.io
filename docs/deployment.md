# Deployment

## GitHub Pages

Create the public `Crisply2404/Crisply2404.github.io` repository and enable GitHub Actions as its Pages source. The workflow builds the site and publishes the artifact at `https://crisply2404.github.io/`.

Set these repository secrets:

- `CHUAN_ZI_TOKEN`: a token with read access to the private `Crisply2404/chuan-zi` repository.
- `VITE_PRESENCE_WS_URL`: the public WSS endpoint for the personal site presence relay.
- `CHUAN_ZI_WS_URL`: the public WSS endpoint used by the `chuan-zi` build.

The workflow checks out the private source into its temporary build workspace, runs its build, and copies only `dist/` into the Pages artifact at `/chuan-zi/`.

## Presence relay

The `presence/` directory is an independent Node.js service. It keeps current visitor states in memory, exposes `/health`, and sends state changes to the single public lobby. It does not write visitor history. Deploy it on a service that supports WebSocket upgrade and HTTPS, then set `VITE_PRESENCE_WS_URL` to its `wss://` address.

```sh
cd presence
npm ci
PORT=8788 HOST=0.0.0.0 ALLOWED_ORIGINS=https://crisply2404.github.io npm start
```

