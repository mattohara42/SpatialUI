# The backend: fetch proxy and unattended collector

**Status: built.** This started as a proposal. The runtime-agnostic core is now
built and tested in `src/backend/`, and the Netlify wrappers that host it are in
`netlify/functions/`. `docs/deploy-netlify.md` is the operator checklist. What's
still missing is a networked deploy to run it against.

The backend is the one piece the source pipeline was designed around but didn't
have: somewhere for a real fetch to happen, and somewhere for polling to run when
no tab is open. The first half of this file describes what's built. The second
half is the design reasoning behind it.

For background, `docs/sources.md` explains why a real source is really two
separate problems and why this is the blocker for the second one,
`docs/prometheus.md` covers the adapter this drives, and `ARCHITECTURE.md` covers
the layer contracts.

---

## Why a backend

A live source needs two things a browser can't provide, and one server-side
process covers both:

1. **A fetch that's allowed to happen.** A browser can't fetch arbitrary
   third-party hosts. CORS blocks it, a bearer token doesn't belong in a client,
   and letting the page hit a host the user names opens a request-forgery hole.
   We checked this here instead of assuming it: every candidate host
   (`api.worldbank.org`, the Prometheus demo server, the news feeds) answers `403`
   at the proxy CONNECT, and the agent proxy itself is healthy. It's policy, not
   a broken setup.
2. **A poll that keeps running when the tab is closed.** `read(now)` is
   synchronous and translates the last snapshot the source holds. Something has
   to update that snapshot on the scrape interval by calling `refresh`. The in-app
   beat does this today (`ecosystemStore.poll` fires `refresh` without awaiting
   it), but only while a tab is open. A source that's only live while someone is
   watching isn't really live.

The server does the fetch the browser can't and runs the loop the tab can't. It
plugs into client seams that already exist and are tested.

---

## What's built

`src/backend/` is pure and passes its tests offline. Every piece takes its
network and its storage as arguments, so the same code runs under any HTTP
framework and any persistence layer. The tests drive it with the Prometheus mock
and an in-memory store.

- **`registry.ts` is the allowlist.** `promRegistry([{ id, query, mapping,
  scrapeIntervalMs }])`. `query` holds the base URL and bearer token on the
  server. The proxy uses `resolve(id)` to turn a client-supplied id into a host
  it's allowed to reach, and the loop walks `all()`.
- **`proxy.ts` is a pipe with an allowlist.** `handleProxyRequest(registry,
  fetchImpl, { sourceId, promql })` resolves the source. It **returns 404 for an
  unknown id** and **403 for any PromQL that isn't the source's registered query
  or `up`**, so a client can't inject queries past the boundary. It then attaches
  the token, forwards the request, and returns the response envelope unchanged.
  An HTTP route is a thin wrapper: read the body, call this, write `status` and
  `body` back.
- **`collectorLoop.ts` moves the poll off the tab.** `createCollectorLoop({
  registry, fetchImpl, storage })` builds a `promSource` for each registered
  source plus a `createCollector`. `tick(now)` refreshes whatever `dueSources`
  says is owed (awaited this time), reads it, and writes it into the record. A
  failed fetch doesn't advance, and the garden greys from staleness, which is the
  right reading. Whatever calls `tick` on a clock is another thin wrapper: a
  `setInterval`, a cron job or a scheduled function, depending on the host.
- **`storage.ts` is the reference store.** `memoryStorage()` implements the same
  three-method `CollectorStorage` interface as the browser's `localStorage`. A
  persistent version is the same three methods over a file or a key-value row.
  That's the one place the runtime leaks in, so it's kept out of the typed core
  (this repo doesn't type `fs`, and the record format is the same wherever the
  bytes end up):

  ```ts
  // file-storage.ts: the ~6-line shell, on a runtime with fs
  import { readFileSync, writeFileSync, rmSync } from 'node:fs';
  import type { CollectorStorage } from '../state/collector';
  export const fileStorage = (path: string): CollectorStorage => ({
    getItem: () => { try { return readFileSync(path, 'utf8'); } catch { return null; } },
    setItem: (_k, v) => writeFileSync(path, v),
    removeItem: () => { try { rmSync(path); } catch {} },
  });
  ```

- **`proxyFetch.ts` is the one-argument client swap.** `promProxyFetch(proxyUrl,
  sourceId)` returns a `FetchLike` that POSTs `{ sourceId, promql }` to the proxy
  instead of calling a host directly. `state/sources.ts` picks it through
  `promFetchImpl(PROM_PROXY_URL)`, a plain function of one env var,
  `VITE_PROM_PROXY_URL`:

  ```ts
  export function promFetchImpl(proxyUrl: string | undefined, sourceId = 'prometheus') {
    return proxyUrl ? promProxyFetch(proxyUrl, sourceId) : mockPromFetch();
  }
  // ...and the source is primed with the synthetic snapshot only when offline:
  if (!PROM_PROXY_URL) prometheus.adopt(syntheticPromSnapshot());
  ```

  With the variable unset (in dev and in every test) the in-process mock stays,
  the app makes no outbound requests, and nothing downstream changes. With it set,
  the same source pulls live data through the proxy. It starts empty and fills on
  its first refresh, so it never shows mock data under a live label. The selection
  is a pure exported function so that "going live is one argument" is covered by a
  test (`proxyFetch.test.ts`).
- **`nflProxy.ts` and `nflProxyFetch.ts`** do the same job for ESPN's NFL feed,
  with an allowlist of paths instead of queries. See `docs/nfl-live.md`.

The three wrappers the core needs to actually run (the HTTP route, the scheduler,
and persistent storage) **exist for Netlify** in `netlify/functions/`:
`prometheus-proxy.ts`, `nfl-proxy.ts`, `collect-scheduled.ts`, and a store backed
by Netlify Blobs. They sit outside the app's `tsc` and `vitest` scope because they
run on Netlify, not in the browser, and that boundary between the tested core and
the host is intentional. The check that live data is stamped `live` survives the
proxy hop and is tested in `proxyFetch.test.ts`.

---

## Where it plugs in

Data flows one way: **adapters emit raw records, translation maps them to
normalized nodes, the store holds them, and the scene subscribes.** The whole
Prometheus path below the network was already built and tested offline against
captured responses. The backend attaches at exactly one point, through three
client-side seams that already had the right shape:

- **`FetchLike` (`adapters/prometheus/query.ts`).** The adapter's only link to
  the outside world, passed in instead of imported: `(url, init) =>
  Promise<{ ok, status, json() }>`. `globalThis.fetch` fits it directly, and so
  does a function that calls our own proxy. This is the one argument that changes
  to go live.
- **`refresh` and `adopt` (`state/sources.ts`, `adapters/prometheus/index.ts`).**
  `refresh(now)` fetches a new `PromSnapshot` and adopts it. `adopt(snapshot)`
  takes one *without* fetching. The code describes it as the way "a backend that
  already fetched would hand results back." A backend that polls on the server and
  pushes snapshots to the client would use `adopt`. A client that pulls from the
  proxy itself uses `refresh`. Both exist.
- **`ObservedRecord` (`state/persist.ts`, `state/collector.ts`).** What the app
  watched, stored sparsely: one sample per node per slot, only when the node
  reported. As the collector's comment puts it, "`ObservedRecord` is already the
  wire format." Moving the loop to a server changes where it runs, not what it
  writes.

So the backend isn't a new layer in the pipeline. It's where the fetch and the
poll now run, and it hands results back through seams the client already has.

---

## Why Prometheus first

`docs/sources.md` makes the full case. In brief:

- It's genuinely live and it **never finishes**, so it didn't need the completion
  vocabulary.
- `up{}` is the source reporting its own liveness, so the backend doesn't have to
  guess from a clock. It fetches a second vector and the translator already reads
  it.
- Building its plumbing forces a real fetch, a real poll and a proxy, which every
  later source (FIFA, fundraising, the declarative HTTP/JSON source) reuses.

FIFA doesn't test anything new, so it's a poor first choice. Fundraising runs into
polarity depending on whose side you're on, and into revised filings, so it should
wait. The backend was built once for Prometheus and extended to the NFL after.

---

## The proxy contract

A thin server-side endpoint that does the fetch the browser isn't allowed to and
nothing else. It's a `FetchLike` with a network on the other side.

```
POST /api/proxy/prometheus
  body: { sourceId, promql }         // never a raw baseUrl from the client
  → 200 { status, data }             // the untouched PromApiResponse envelope
  → 4xx/5xx { error }                // surfaced, not swallowed
```

What it does, and what it refuses to do:

- **It resolves `sourceId` to an endpoint and token held on the server.** The
  client says which configured source it wants and never names a host. The base
  URL and token live in server config, so a client can only reach servers an
  operator registered. That closes the request-forgery hole, and it's why the
  proxy is a real trust boundary and not just a way around CORS.
  `PromQuery.token` stays on the server. The client never sees it and no node
  carries it (the type comment says "never logged, never stored on a node").
- **It returns the response envelope unchanged.** `parseInstantVector` and
  `fetchPromSnapshot` already turn a `PromApiResponse` into a `PromSnapshot`:
  values arrive as strings, seconds become milliseconds, error envelopes throw, and
  NaN and Inf are dropped. If the proxy re-parsed or "cleaned" anything, that
  logic would be split across two places. It passes data through an allowlist and
  doesn't translate.
- **It keeps errors distinct from empty results.** A `status: "error"` envelope
  isn't an empty garden. The parser throws on it on purpose so the app can tell a
  broken query from one with no results, and passing the envelope through keeps
  that distinction intact.

Nothing downstream of the client changes. The live test (`prometheus.live.test.ts`)
already covers the whole path against a real server, and the proxy only changes
where that server is reached from.

---

## The collector loop contract

The proxy answers when asked. The loop is what does the asking when nobody's
looking. `collector.ts` described it as the missing half: "a collector that truly
runs whether or not anyone is looking is a process, and this project has no server
to put one in."

For each configured live source, on that source's own schedule, it:

1. **Asks when the source says to.** `StaleSchedule.dueAfter` answers both
   "should I have heard something by now?" and "is there anything new to fetch?"
   (polling and staleness are the same question, see `state/sources.ts`). The loop
   refreshes when a reading is owed and has no clock of its own. For Prometheus
   that's `promStaleSchedule(scrapeIntervalMs)`: due one interval after the last
   sample, grey after two intervals of silence.
2. **Fetches, translates and records.** It runs `fetchPromSnapshot`, then
   `translatePromSnapshot`, then `observe` into an `ObservedRecord`. These are the
   same three steps `ecosystemStore` runs in the browser today. The record uses
   the existing format: sparse, one sample per node per slot, absolute slots,
   rounded to four decimals on the way in. `encodeRecord` is a plain stringify,
   so the server writes the same bytes the browser's `localStorage` holds.
3. **Serves the record back when a tab connects.** A new tab restores the
   server's `ObservedRecord` the same way it restores the local one today.
   `restoreRecord` fills observations into the gaps a source left in the history
   buffers and never overwrites what the source currently says. `mergeRecord`
   already exists, so a tab that also collected while open reconciles with the
   server's record instead of fighting it.

Two limits worth knowing:

- **The coarse tier is what matters.** Over a week, the hourly tier mostly
  overlaps what a live source can still tell you again. Over a season, the daily
  tier is the only place those days exist. When space runs short the fine tier
  goes first (`shedRecord`). That's why running the loop unattended gets you
  something a re-fetch on reload can't.
- **It writes on a timer, not on every sample.** Recording an observation is
  cheap and happens on every reading. Serializing a whole season isn't, so writes
  happen at most every `WRITE_INTERVAL_MS` (30s). The server keeps the same
  minimum, so a crash loses at most half a minute of an hourly series.

---

## Auth and secrets

The proxy is the only component that holds a credential, and that's the reason
it has to be a server instead of a CORS workaround.

- **Tokens live in server config, keyed by `sourceId`.** They never appear in the
  client bundle, in a query string, or in a node's `raw`. `PromQuery.token` is read
  on the server and sent as `Authorization: Bearer` inside `fetchPromSnapshot`. The
  client's proxy call carries no secret.
- **The client names sources and the server names hosts.** An allowlist of
  registered sources is what makes "point the garden at a URL" safe. When the
  garden builder gets its fetch half (the last step in `docs/garden-builder.md`),
  adding a source will mean an operator registering an endpoint, not the client
  passing one. It's the same boundary, widened by configuration and never by
  trusting the page.

---

## Provenance and honesty

The backend inherits every rule the app already follows, and one of them has to
survive the extra hop:

- **`provenance.kind` must be `live`, and a test checks it.** `fetchPromSnapshot`
  stamps `kind: 'live'` with the endpoint and query, and the mock stamps
  `captured`. The HUD's "this is simulated" marker is derived from that. Because
  the proxy returns the envelope unchanged and `fetchPromSnapshot` runs as normal,
  proxied data comes out `live` automatically. The assertion
  `expect(source.snapshot?.provenance.kind).toBe('live')` guards it.
- **Provenance travels with every value.** The World garden established that every
  derived judgement keeps the evidence it came from. A value from the backend has
  to say where it came from, so the inspection HUD can always answer "says who?".
  The node's `raw` field exists for exactly this.
- **Third-party terms apply as soon as real content comes in.** A vendor's or a
  news wire's terms on storing and showing their data bind a live source.
  Prometheus (an operator's own metrics) avoids this. A news or vendor feed
  doesn't, and the feature has to make that visible. The World and news work
  flagged it as a ship-blocker, and it applies here too.

---

## Testing without network access

This could be built with confidence in an environment with no network because
the seams run offline and only the socket is missing.

- The proxy's core (resolve `sourceId`, forward `promql`, return the envelope) is
  tested against a captured `PromApiResponse` with no server, the same way
  `mockPromFetch` stands in for the socket today.
- The collector loop is the browser loop moved. Its logic (`observe`,
  `mergeRecord`, `restoreRecord`, `shedRecord`) is already pure and tested.
- `prometheus.live.test.ts` is the one test that needs a real server, and it's
  skipped unless `PROM_LIVE_URL` is set. It only asserts what any real Prometheus
  has to satisfy (well-formed nodes, vitals in range, `provenance.live`) and never
  checks a specific value. Point it at a proxy URL and it tests the whole path.

So having no server here stops us *running* the live path, not building and
testing it. Everything except the socket passes offline.

---

## Build order

The smallest version that's genuinely live:

1. ~~**A single-route proxy**~~ (`POST /api/proxy/prometheus`) with one registered
   source whose endpoint and token live in server config. **Done.**
2. ~~**The client swap.**~~ `fetchImpl` points at the proxy behind a build flag,
   so the app ships using the mock and switches to the proxy where one exists.
   **Done.**
3. ~~**The collector loop**~~ running fetch, translate and observe on schedule,
   writing `ObservedRecord` to server storage and serving it back on connect.
   **Done** (for Prometheus).
4. **Generalize.** The registered-source allowlist becomes the operator side of
   the garden builder's fetch, and the declarative HTTP/JSON source
   (`translation/declarative.ts`) goes behind the same proxy with a different
   `sourceId`. The collector loop also needs extending beyond Prometheus (the NFL
   proxy exists but the loop doesn't cover it yet).

Steps 1 to 3 make Prometheus live. Step 4 is where every other source gets the
same treatment cheaply, which was the reason for building Prometheus first.

---

## Open questions

These are decisions a real deployment will force. They're listed here so they're
waiting when it happens:

- **Push or pull to a connected tab?** The loop writes the record on the server
  either way. An open tab can pull fresh snapshots through the proxy on its own
  schedule (via `refresh`), or the server can push them (via `adopt` over a
  socket). It's a trade between latency and complexity, and both seams exist, so
  it can wait without rework. Pull is what's built today.
- **Where does server state live?** The record is small and its format is fixed,
  so a file, a key-value store or a database row would all work. The store adapter
  is the only place the choice shows up, the same way `collector.ts` keeps
  `localStorage` in one place. The Netlify deploy uses Blobs.
- **Multiple tenants, eventually.** One registered source per operator is
  single-tenant by design. User-defined sources at scale would need per-user
  config and quotas on the loop. That's real work, but only after one Prometheus
  garden is actually live.

The test is the same as for every source before it: a stranger glancing at the
garden reads health correctly without being told the domain, and the app never
claims something it can't show evidence for. A backend that serves a confident but
wrong plant fails that test just as a bad mapping would.
