# Deploying to Netlify

The runtime-agnostic backend (`src/backend/`) plus the Netlify shells in
`netlify/functions/` are everything a live Prometheus garden needs. This is the
operator's checklist: one dependency, a handful of env vars, and connect the repo.

Read `docs/backend.md` for why the pieces are shaped this way; this file is just
how to stand them up on Netlify.

---

## What deploys

Three things, all already in the repo:

- **The static site** — `npm run build` → `dist/`, served by Netlify's CDN.
- **The proxy** (`netlify/functions/prometheus-proxy.ts`) — the fetch a browser
  can't make. Routes itself at `/api/proxy/prometheus`; the client POSTs
  `{ sourceId, promql }`, it resolves the id against the env-built registry and
  returns the Prometheus envelope. All logic is the tested `handleProxyRequest`.
- **The collector** (`netlify/functions/collect-scheduled.ts`) — a Scheduled
  Function that runs the tested `createCollectorLoop.tick()` every minute,
  persisting the `ObservedRecord` to **Netlify Blobs** so a season survives across
  invocations and a shut tab.

---

## One dependency

The functions add exactly one package the app itself does not use — the Blobs
client for persistence:

```bash
npm install @netlify/blobs
```

The proxy needs nothing extra: it uses the Web-standard `Request`/`Response` and
an in-file `config.path`, so it carries no `@netlify/functions` import. (The app's
own `npm run build`, `npm run test`, and `npm run typecheck` never touch
`netlify/`, so this dependency does not affect them.)

---

## Environment variables

Set these on the site (`netlify env:set NAME value`, or the Netlify UI). The
**client** var is read at build time; the **server** vars are read by the
functions at request time and never reach the browser.

### Client (build-time)

| var | value |
| --- | --- |
| `VITE_PROM_PROXY_URL` | `/api/proxy/prometheus` — points the source at the proxy. Unset keeps the in-process mock. |

### Server (function runtime) — the registry, the allowlist's operator face

| var | required | meaning |
| --- | --- | --- |
| `PROM_ENDPOINT` | ✅ | Prometheus base URL, e.g. `https://prometheus.example.com`. |
| `PROM_QUERY` | ✅ | The PromQL instant query that becomes the plants, e.g. `probe_duration_seconds` or `up`. |
| `PROM_VITALITY_MIN` | ✅ | Metric value that reads as *dying* (0 on the axis). |
| `PROM_VITALITY_MAX` | ✅ | Metric value that reads as *thriving* (1). For latency (lower is better) put `min` above `max`; for `up` use `0` and `1`. |
| `PROM_TOKEN` |  | Bearer token, if the server wants one. Server-side only. |
| `PROM_ID_LABEL` |  | Label that names a plant. Default `instance`. |
| `PROM_BED_LABEL` |  | Label that groups plants into beds. Default `job`. |
| `PROM_POLARITY` |  | `nurture` (growth is good) or `suppress` (growth is alarm). Default `nurture`. |
| `PROM_DOMAIN` |  | Free-form domain tag for the HUD. Default `devops`. |
| `PROM_PLANTING` |  | Bed look. Default `conifer-stand`. |
| `PROM_SCRAPE_MS` |  | Scrape interval for the staleness/poll cadence. Default `60000`. |
| `PROM_INCLUDE_UP` |  | `false` to skip the `up{}` liveness vector. Default on. |

`vitality` is required and has no default on purpose: it is the one thing the
numbers cannot say — *what value is healthy* — and defaulting it would let the
garden show a confident wrong plant, the exact failure `docs/sources.md` forbids.

---

## Deploy

1. `npm install @netlify/blobs` and commit the lockfile change.
2. Connect the repo to Netlify (`netlify init`, or the UI). `netlify.toml` already
   sets the build command, publish dir, and functions dir.
3. Set the env vars above. **Redeploy after setting `VITE_PROM_PROXY_URL`** — it
   is baked into the client at build time, so a value set after a build does not
   take effect until the next one.
4. Enable Netlify Blobs on the site if it is not on by default (it backs the
   collector's persistence).

That is the whole of it. With the vars unset the deploy still works — it just runs
the mock, exactly as it does locally.

---

## How the seams line up

- The client's `promProxyFetch(PROM_PROXY_URL, 'prometheus')` POSTs to the proxy;
  the proxy's registry id is `prometheus` — the two must match, and both default
  to it.
- The proxy permits only `PROM_QUERY` and `up` for that source (the 403 in
  `handleProxyRequest`), so a client cannot run arbitrary PromQL on your server.
- The collector writes the record under the same `STORAGE_KEY` the browser uses,
  so the Blobs blob is byte-identical to a `localStorage` record — the shared
  `ObservedRecord` format doing its job.

---

## Two honest limits

- **Pull, for now.** A connected tab reads the record and re-fetches through the
  proxy on its own beat; the server does not push. Push (server → `adopt` over a
  socket) is a later upgrade and reuses the same core — it is the one open design
  call in `docs/backend.md`.
- **Per-minute collection.** Netlify's schedule floor is one minute. The record's
  fine tier is hourly, so this is finer than anything read back — not a
  limitation in practice, but worth knowing if a tighter cadence is ever wanted
  (that is the long-running-service path, not this one).
