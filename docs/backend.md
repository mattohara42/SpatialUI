# The backend — the fetch proxy and the unattended collector loop

Was a proposal; now the runtime-agnostic core is built and tested, and only two
thin shells are left to a deploy target. This settles the shape of the one piece
the whole source pipeline was built around and did not have: a place for a real
fetch to happen, and a place for the poll to run when no tab is open. Written so
that when a networked environment exists, the work is standing up a known
interface — most of which now exists in `src/backend/` — rather than deciding
what it should be. The **Reference implementation** section below maps the design
onto the code; the sections before it are the reasoning that shaped it.

Read `docs/sources.md` for why a real source is two problems wearing one
sentence and why this is the second's critical-path blocker; `docs/prometheus.md`
for the adapter this drives; `ARCHITECTURE.md` for the layer contracts. This file
is the part those do not carry: the backend's exact contract, pinned to the seams
that already exist in the client, and what stays true whether or not this
environment ever gets egress.

---

## The short answer

A live source needs two things a browser cannot give it, and they are **one
piece of work, not two**:

1. **A fetch that is allowed to happen.** A browser cannot fetch arbitrary
   third-party hosts — CORS forbids it, a bearer token does not belong in a
   client, and pointing the app at a user-named host from the page is a
   request-forgery surface. Verified here, not assumed: every candidate host
   (`api.worldbank.org`, the Prometheus demo server, the news feeds) answers
   `403` at the proxy CONNECT, and the agent proxy itself is healthy, so it is
   policy and not a broken setup.

2. **A poll that keeps running when the tab is shut.** `read(now)` is
   synchronous and translates the last snapshot the source holds; something has
   to *fill* that snapshot on the scrape interval by calling `refresh`. The
   in-app beat does this today (`ecosystemStore.poll` kicks `refresh`
   fire-and-forget), but only while a tab is open. A source that is live only
   when someone is looking is not live.

Both resolve to a single server-side process: it does the fetch the browser
can't, and it runs the loop the tab can't. Everything below is the contract that
process implements and the exact client seams it plugs into — all of which
already exist and are tested.

---

## The line, and how little is above it

Data flows one way — **adapters emit raw records → translation maps them to
normalized nodes → the store holds them → the scene subscribes** — and the whole
Prometheus path below the network is already built and pinned offline against
captured wire-shape responses. What the backend adds sits at exactly one seam.

Three client-side seams are already the right shape and must not be rebuilt:

- **`FetchLike` (`adapters/prometheus/query.ts`).** The adapter's only dependency
  on the outside world, injected rather than imported: `(url, init) =>
  Promise<{ ok, status, json() }>`. `globalThis.fetch` satisfies it with no
  adapter, and so does a function that calls *our own* proxy. This is the single
  argument that changes to go live.

- **`refresh` / `adopt` (`state/sources.ts`, `adapters/prometheus/index.ts`).**
  `refresh(now)` fetches a fresh `PromSnapshot` and adopts it; `adopt(snapshot)`
  takes one *without fetching* — named in the code as "the seam a backend that
  already fetched would hand results back through." A backend that polls
  server-side and pushes snapshots to the client uses `adopt`; a client that
  pulls from the proxy itself uses `refresh`. Both already exist.

- **`ObservedRecord` (`state/persist.ts`, `state/collector.ts`).** What the app
  watched, stored sparsely — one sample per node per slot, when a node reported.
  The collector comment is explicit that this is "as far as a browser-only app
  honestly goes… the seam is the same one a server would sit behind, because
  `ObservedRecord` is already the wire format." Moving the loop server-side is a
  change of *where it runs*, not of *what it writes*.

So the backend is not a new layer in the pipeline. It is the runtime the fetch
and the poll move into, handing results back through seams the client already
exposes.

---

## Prometheus first — and why not the others

Prometheus is the first real source, for reasons `docs/sources.md` argues at
length and this doc takes as settled:

- It is genuinely live and it **never finishes**, so it sidesteps the completion
  vocabulary entirely.
- `up{}` is staleness the source *states about itself*, so the backend does not
  have to infer liveness from a clock — it fetches a second vector and the
  translator already reads it.
- Building its plumbing forces the real fetch, the real poll, and the proxy —
  which every later user source (FIFA, fundraising, a declarative HTTP/JSON
  source) then reuses unchanged.

FIFA stresses nothing new and is a poor thing to build first; fundraising walks
into polarity-as-a-position and revised filings and should wait. The backend is
built once, for Prometheus, and generalized afterward.

---

## The proxy contract

A thin server-side endpoint that does the fetch the browser is forbidded to,
and nothing else. It is a `FetchLike` with a network on the far side.

**Shape.** One route the client calls in place of a direct Prometheus URL:

```
POST /api/proxy/prometheus
  body: { sourceId, promql }         // never a raw baseUrl from the client
  → 200 { status, data }             // the untouched PromApiResponse envelope
  → 4xx/5xx { error }                // surfaced, not swallowed
```

The endpoint's responsibilities, and its refusals:

- **It resolves `sourceId` to a *server-held* endpoint and token.** The client
  names *which configured source*, never a host. The base URL and bearer token
  live in server config, so a client can only reach servers an operator
  registered — this is what closes the request-forgery hole, and it is why the
  proxy is a real trust boundary and not a CORS shim. `PromQuery.token` stays on
  the server; the client never sees it and the node never carries it (the type
  comment already says "never logged, never stored on a node").

- **It returns the wire envelope untouched.** `parseInstantVector` and
  `fetchPromSnapshot` already know how to turn `PromApiResponse` into a
  `PromSnapshot` — value-as-string, seconds-to-ms, error-envelope-throws,
  NaN/Inf-dropped. The proxy must not re-parse or "clean" anything, or it splits
  that logic across two codebases. It is a pipe with an allowlist, not a
  translator.

- **It preserves the error/empty distinction.** A `status: "error"` envelope is
  not an empty garden; the parser throws on it deliberately so the app can tell a
  dead query from an empty one. The proxy passes the envelope through so that
  distinction survives the hop.

The client wiring is then the single-argument swap the whole design promised. In
`state/sources.ts`, the Prometheus source's `fetchImpl` goes from
`mockPromFetch()` to a `FetchLike` that POSTs to the proxy:

```ts
const proxyFetch: FetchLike = async (url, init) => {
  const promql = new URL(url).searchParams.get('query') ?? '';
  return fetch('/api/proxy/prometheus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceId: 'prometheus', promql }),
    signal: init?.signal,
  });
};
```

Nothing downstream changes. The live test (`prometheus.live.test.ts`) already
asserts the whole path against a real server; the proxy just moves *where* the
real server is reached from.

---

## The collector loop contract

The proxy answers when asked. The loop is what does the asking when no one is
looking. It is the half `collector.ts` names as missing — "a collector that truly
runs whether or not anyone is looking is a process, and this project has no server
to put one in."

**Shape.** For each configured live source, on the source's own cadence:

1. **Ask on the schedule the source already states.** `StaleSchedule.dueAfter`
   answers both "should I have heard by now" and "is there anything new to
   fetch" — the poll and staleness are one question (`state/sources.ts`). The
   loop reads the schedule and refreshes when a reading is owed; it invents no
   clock of its own. For Prometheus that is `promStaleSchedule(scrapeIntervalMs)`:
   due one interval after the last sample, grey after two of silence.

2. **Fetch, translate, observe.** Run `fetchPromSnapshot` → `translatePromSnapshot`
   → `observe` into an `ObservedRecord`, the same three steps `ecosystemStore`
   runs client-side today, moved server-side. The record is *exactly* the format
   already defined: sparse, one sample per node per slot, absolute slots, rounded
   at the door to four decimals. `encodeRecord` is a plain stringify by design,
   so the server writes the identical bytes the browser's `localStorage` holds
   now.

3. **Serve the record back on connect.** When a tab opens, it restores the
   server's `ObservedRecord` the same way it restores the local one today —
   `restoreRecord` lays observations back into the history buffers, into the gaps
   a source left and never over what it currently says. The merge is already
   written (`mergeRecord`), so a client that also collected while open reconciles
   with the server's record rather than fighting it.

**Two honest limits to state, not paper over:**

- **The fine tier is largely redundant; the coarse tier is the point.** Over a
  week the hourly tier overlaps what a live source can still re-tell; over a
  season the daily tier is the only place those days exist at all. Shedding drops
  fine first (`shedRecord`). The backend inherits that asymmetry — it is why
  running the loop unattended *buys* something a re-fetch on reload cannot.

- **Write cadence, not every sample.** Observation is cheap and happens on every
  reading; serializing a season is not (`WRITE_INTERVAL_MS`, 30s). The server
  keeps the same floor, so a crash costs at most half a minute of an
  hourly-grained series.

---

## Auth, secrets, and the trust boundary

The proxy is the only component that holds a credential, and that is the whole
reason it is a server and not a CORS relaxation:

- **Tokens live in server config, keyed by `sourceId`.** Never in the client
  bundle, never in a query string, never on a node's `raw`. `PromQuery.token`
  is read server-side and attached as `Authorization: Bearer` inside
  `fetchPromSnapshot`; the client's proxy call carries no secret.

- **The client names sources, the server names hosts.** A registered-source
  allowlist is what makes "point the garden at a URL" safe. When the
  garden-builder's *fetch* half lands (`docs/garden-builder.md` step 6), adding a
  source is an operator registering an endpoint, not the client passing one — the
  same boundary, widened by configuration rather than by trusting the page.

---

## Provenance and the honesty constraints

The backend inherits every constraint the app already holds itself to, and one
of them it must actively preserve across the hop:

- **`provenance.kind` must read `live`, and the live test checks it.**
  `fetchPromSnapshot` stamps `kind: 'live'` with the endpoint and query; the
  mock stamps `captured`. The HUD's "this is simulated" marker derives from that,
  so the proxy path must produce a `live` snapshot — which it does for free,
  because the proxy returns the wire envelope and `fetchPromSnapshot` runs
  unchanged. The test `expect(source.snapshot?.provenance.kind).toBe('live')` is
  the tripwire that this stayed true.

- **Provenance travels with every value.** The World garden made this
  load-bearing: every derived judgment keeps the evidence it came from. A backend
  value has to carry where it came from so the inspection HUD can always answer
  "says who". `raw` on the node already exists for exactly this payload.

- **Third-party terms apply the moment real content is ingested.** A vendor's or
  a wire's terms on storing and showing their data bind a live source. Prometheus
  (an operator's own metrics) sidesteps this; a news or vendor feed does not, and
  the feature must surface that, not bury it. Flagged as a ship-blocker in the
  World/news work and inherited here wholesale.

---

## What stays offline-testable — and how we verify without egress

The reason this doc can be written and the backend built with confidence in an
environment that has no network: **the seam is exercised offline, and only the
socket is missing.**

- The proxy has a pure core — resolve `sourceId`, forward `promql`, return the
  envelope — testable against a captured `PromApiResponse` with no server, the
  same way `mockPromFetch` stands in for the socket today.
- The collector loop is the client loop moved; its logic (`observe`,
  `mergeRecord`, `restoreRecord`, `shedRecord`) is already pure and node-tested.
- `prometheus.live.test.ts` is the one test that needs a real server, and it is
  `skipIf` no `PROM_LIVE_URL` is reachable. It asserts only what any real
  Prometheus must satisfy — well-formed nodes, vitals in range, `provenance.live`
  — never a specific value. Point it at a proxy URL and it certifies the whole
  path the moment there is one to point at.

So "we can't reach a server here" blocks *running* the live path, not *building
and testing* it. Every piece but the socket is green offline, which is the state
the rest of the pipeline is already in.

---

## Reference implementation — the shipped core

`src/backend/` is the runtime-agnostic half, pure and green offline (19 tests).
Every piece takes its network and its storage as injected arguments, so the same
code runs under any HTTP framework and any persistence, and the tests drive it
with the Prometheus mock and an in-memory store.

- **`registry.ts` — the allowlist.** `promRegistry([{ id, query, mapping,
  scrapeIntervalMs }])`. `query` carries the base URL and bearer token,
  server-side; `resolve(id)` is how the proxy turns a client-named id into a host
  it was allowed to reach, and `all()` is what the loop walks.

- **`proxy.ts` — the pipe with an allowlist.** `handleProxyRequest(registry,
  fetchImpl, { sourceId, promql })` resolves the source, **404s an unknown id**
  and **403s any PromQL that is neither the source's registered query nor `up`**
  (no query injection past the boundary), attaches the token, forwards, and
  returns the wire envelope untouched. An HTTP route is a thin shell over this —
  read the body, call it, write `status`/`body` back.

- **`collectorLoop.ts` — the poll, moved off the tab.** `createCollectorLoop({
  registry, fetchImpl, storage })` builds a `promSource` per registered source and
  a `createCollector`, and `tick(now)` refreshes whatever `dueSources` says is
  owed (awaited, not fire-and-forget), reads it, and notes it into the record. A
  failed fetch does not advance — staleness greys the garden, the honest reading.
  The scheduler that calls `tick` on a clock is the other thin shell (a
  `setInterval`, a cron, a scheduled function — the deploy target's choice).

- **`storage.ts` — the reference store.** `memoryStorage()` implements the same
  three-method `CollectorStorage` the browser's `localStorage` does. The
  persistent adapter is the same three methods over a file or a KV row — the one
  place a runtime leaks in, left out of the typed core because a file read is
  `fs`, which this repo does not type, and because the record format is fixed
  wherever the bytes land:

  ```ts
  // file-storage.ts — the ~6-line shell, on a runtime with fs
  import { readFileSync, writeFileSync, rmSync } from 'node:fs';
  import type { CollectorStorage } from '../state/collector';
  export const fileStorage = (path: string): CollectorStorage => ({
    getItem: () => { try { return readFileSync(path, 'utf8'); } catch { return null; } },
    setItem: (_k, v) => writeFileSync(path, v),
    removeItem: () => { try { rmSync(path); } catch {} },
  });
  ```

- **`proxyFetch.ts` — the single-argument client swap, now wired.**
  `promProxyFetch(proxyUrl, sourceId)` returns a `FetchLike` that POSTs
  `{ sourceId, promql }` to the proxy instead of reaching a host directly, and
  `state/sources.ts` selects it through `promFetchImpl(PROM_PROXY_URL)` — a plain
  function of one env var, `VITE_PROM_PROXY_URL`:

  ```ts
  export function promFetchImpl(proxyUrl: string | undefined, sourceId = 'prometheus') {
    return proxyUrl ? promProxyFetch(proxyUrl, sourceId) : mockPromFetch();
  }
  // ...and the source is primed with the synthetic snapshot only when offline:
  if (!PROM_PROXY_URL) prometheus.adopt(syntheticPromSnapshot());
  ```

  Unset (dev, and every test) keeps the in-process mock, so the app runs with no
  egress and nothing downstream changes; set the var in a networked deploy and the
  same source pulls live through the proxy, starting empty and filling on its first
  refresh rather than showing mock data behind a live label. The selection is a
  pure exported function precisely so "going live is one argument" is a tested
  fact, not a claim (`proxyFetch.test.ts`).

What is **not** here, and why: the HTTP route, the scheduler, and the persistent
`CollectorStorage` — each a shell around a tested seam, each needing a running
process this environment does not have. The `prometheus.live.test.ts` tripwire
(`provenance.kind === 'live'`) is preserved across the proxy hop and checked in
`proxyFetch.test.ts`.

## The minimal viable backend

Smallest thing that is honestly live, in build order:

1. **A single-route proxy** (`POST /api/proxy/prometheus`) with one hardcoded
   registered source, its endpoint and token in server config. Pure core tested
   against a captured envelope; the route is a thin shell over it.
2. **The client swap** — `fetchImpl: proxyFetch` behind a build flag, so the app
   ships pointed at the mock and flips to the proxy where one exists. Wired and
   unit-tested against a mock proxy; no downstream change.
3. **The collector loop** running `fetch → translate → observe` on the schedule,
   writing `ObservedRecord` to server storage, served back on connect. Reuses the
   pure collector; the only new code is the scheduler and the store adapter.
4. **Generalize** — the registered-source allowlist becomes the operator side of
   the garden-builder's fetch half, and the declarative HTTP/JSON source
   (`translation/declarative.ts`) drops in behind the same proxy with a different
   `sourceId`.

Steps 1–3 make Prometheus genuinely live. Step 4 is where every other source
follows for free, which was the point of building Prometheus first.

---

## Open questions

Named rather than answered, because they are the decisions a real deployment
forces and this doc's job is to have them waiting rather than to guess:

- **Push or pull to the connected client?** The loop writes the record
  server-side regardless. Whether an open tab pulls fresh snapshots through the
  proxy on its own beat (via `refresh`) or the server pushes them (via `adopt`
  over a socket) is a latency/complexity trade-off; both seams exist, so this can
  be deferred without rework.
- **Where does server state live?** The record is small and the format is fixed;
  a file, a KV store, or a row are all adequate. The store adapter is the only
  place that decision leaks, mirroring how `collector.ts` isolates `localStorage`.
- **Multi-tenant, eventually.** A registered source per operator is single-tenant
  by construction. User-defined sources at scale mean per-user config and quotas
  on the loop — real, but strictly past the point where one Prometheus garden is
  live, and out of scope until then.

The test the whole thing has to pass is unchanged from every source before it: a
stranger glancing at the garden reads health correctly without being told the
domain, and the app never asserts something it cannot show the evidence for. A
backend that serves a confident-looking wrong plant has failed that test as
surely as a bad mapping would.
