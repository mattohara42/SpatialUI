# Deploying to Netlify

The runtime-agnostic backend in `src/backend/`, together with the Netlify
wrappers in `netlify/functions/`, is everything a live Prometheus garden needs.
This is the operator's checklist: install one dependency, set a few environment
variables, and connect the repo.

`docs/backend.md` explains why the pieces are shaped the way they are. This file
only covers standing them up on Netlify.

---

## What deploys

Four things, all already in the repo:

- **The static site.** `npm run build` writes `dist/`, which Netlify's CDN serves.
- **The Prometheus proxy** (`netlify/functions/prometheus-proxy.ts`). This makes
  the fetch a browser can't. It routes itself at `/api/proxy/prometheus`. The
  client POSTs `{ sourceId, promql }`, the proxy looks the id up in the registry
  built from env vars, and it returns the Prometheus response envelope. All of
  the logic lives in the tested `handleProxyRequest`.
- **The collector** (`netlify/functions/collect-scheduled.ts`). A Scheduled
  Function that runs the tested `createCollectorLoop.tick()` every minute and
  saves the `ObservedRecord` to **Netlify Blobs**, so a season survives between
  invocations and keeps going while no tab is open.
- **The NFL proxy** (`netlify/functions/nfl-proxy.ts`). The Prometheus proxy's
  sibling, for ESPN's public feed. It routes itself at `/api/proxy/nfl`. The
  client POSTs `{ sourceId, path }`, the proxy checks the path against the four
  ESPN resources it allows, and it returns ESPN's JSON. The logic lives in the
  tested `handleNflProxyRequest`. `docs/nfl-live.md` covers what it fetches.

---

## One dependency

The functions need one package the app doesn't use, the Blobs client for
persistence:

```bash
npm install @netlify/blobs
```

The proxy needs nothing extra. It uses the web-standard `Request` and `Response`
and an in-file `config.path`, so it doesn't import `@netlify/functions`. The
app's own `npm run build`, `npm run test` and `npm run typecheck` never touch
`netlify/`, so this dependency doesn't affect them.

---

## Environment variables

Set these on the site with `netlify env:set NAME value` or in the Netlify UI.
The **client** variables are read at build time. The **server** variables are
read by the functions at request time and never reach the browser.

### Client (build time)

| var | value |
| --- | --- |
| `VITE_PROM_PROXY_URL` | `/api/proxy/prometheus` points the Prometheus source at the proxy. Leave it unset to keep the in-process mock. |
| `VITE_NFL_PROXY_URL` | `/api/proxy/nfl` points the NFL source at the proxy for a real ESPN season. Leave it unset to keep the seeded season. |

### Server (function runtime)

These build the registry, which is also the allowlist of what the proxy will
fetch.

| var | required | meaning |
| --- | --- | --- |
| `PROM_ENDPOINT` | ✅ | Prometheus base URL, e.g. `https://prometheus.example.com`. |
| `PROM_QUERY` | ✅ | The PromQL instant query that becomes the plants, e.g. `probe_duration_seconds` or `up`. |
| `PROM_VITALITY_MIN` | ✅ | Metric value that reads as *dying* (0 on the axis). |
| `PROM_VITALITY_MAX` | ✅ | Metric value that reads as *thriving* (1). For latency, where lower is better, put `min` above `max`. For `up` use `0` and `1`. |
| `PROM_TOKEN` |  | Bearer token, if the server wants one. Server side only. |
| `PROM_ID_LABEL` |  | Label that names a plant. Default `instance`. |
| `PROM_BED_LABEL` |  | Label that groups plants into beds. Default `job`. |
| `PROM_POLARITY` |  | `nurture` (growth is good) or `suppress` (growth is alarm). Default `nurture`. |
| `PROM_DOMAIN` |  | Free-form domain tag for the HUD. Default `devops`. |
| `PROM_PLANTING` |  | Bed look. Default `conifer-stand`. |
| `PROM_SCRAPE_MS` |  | Scrape interval, used for staleness and poll timing. Default `60000`. |
| `PROM_INCLUDE_UP` |  | `false` skips the `up{}` liveness query. On by default. |

The vitality range is required and has no default on purpose. It's the one thing
the numbers can't tell you: what value counts as healthy. A default would let
the garden show a confident but wrong plant, which is exactly the failure
`docs/sources.md` rules out.

The NFL proxy has no required variables. ESPN's feed is free and needs no key, so
setting `VITE_NFL_PROXY_URL` is all it takes:

| var | required | meaning |
| --- | --- | --- |
| `NFL_ENDPOINT` |  | ESPN football base URL. Defaults to `https://site.api.espn.com/apis/site/v2/sports/football`. Only override it if you put your own gateway in front of ESPN. |
| `NFL_TOKEN` |  | Bearer token, only if that gateway wants one. ESPN's public feed doesn't. |

The NFL source doesn't need an operator-set vitality range because a football
result already says how things are going: a win is thriving. Its mapping lives in
`translation/nfl.ts`, not in env config, so there's no way to get a wrong plant
from a missing variable. See `docs/nfl-live.md`.

---

## Deploy

1. Run `npm install @netlify/blobs` and commit the lockfile change.
2. Connect the repo to Netlify (`netlify init`, or the UI). `netlify.toml`
   already sets the build command, publish directory and functions directory.
3. Set the env vars above. **Redeploy after setting the `VITE_` variables.** They
   are baked into the client at build time, so a value set after a build does
   nothing until the next one.
4. Turn on Netlify Blobs for the site if it isn't on by default. The collector
   stores its record there.

That's it. With the variables unset the deploy still works and runs the mock,
the same as it does locally.

---

## How the pieces connect

- The client's `promProxyFetch(PROM_PROXY_URL, 'prometheus')` POSTs to the proxy,
  and the proxy's registry id is `prometheus`. The two have to match, and both
  default to that value.
- For that source the proxy only allows `PROM_QUERY` and `up` (anything else gets
  the 403 in `handleProxyRequest`), so a client can't run arbitrary PromQL on
  your server.
- The collector writes the record under the same `STORAGE_KEY` the browser uses,
  so the blob in Netlify Blobs is byte-identical to a `localStorage` record. Both
  sides share the `ObservedRecord` format.

---

## Two limits

- **It pulls for now.** A connected tab reads the record and re-fetches through
  the proxy on its own schedule. The server doesn't push. Push (the server calling
  `adopt` over a socket) is a later upgrade that reuses the same core, and it's
  the one open design decision in `docs/backend.md`.
- **Collection runs once a minute.** That's Netlify's minimum schedule. The
  record's finest tier is hourly, so a minute is already finer than anything the
  app reads back. If you ever need a tighter cadence, that means running a
  long-lived service instead of this setup.
