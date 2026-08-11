# Testing a real-world data source: Prometheus

`docs/sources.md` names Prometheus as *the archetype the whole idea was built
for* and the right first real source. This is the record of building it as far
as this environment allows, and — the question that started it — **how you test
a real-world source when the environment's egress is policy-restricted.**

The short version: the source is written so that the *only* thing a networked
run adds is a real socket. Everything else — the wire parsing, the mapping, the
translation to nodes — is exercised offline against captured responses, and the
live end-to-end test switches on the moment a real server is reachable.

## The three layers, and where each is tested

| layer | file | tested by |
| --- | --- | --- |
| fetch + parse the wire | `adapters/prometheus/query.ts` | `query.test.ts`, against captured `/api/v1/query` responses |
| the mapping → nodes | `translation/prometheus.ts` | `translation/prometheus.test.ts` |
| the whole path, live | `adapters/prometheus/index.ts` (`promSource`) | `prometheus.live.test.ts`, against a real server |

The captured responses (`adapters/prometheus/fixtures.ts`) are in the exact wire
shape a real Prometheus returns — value as a string, timestamp in seconds,
labels under `metric` — so a fixture and a live server produce a
byte-identical `PromSnapshot`, and the translator cannot tell which it got.

## Running the live test

The deterministic suites run everywhere and need no network. The live test is
skipped unless you point it at a real Prometheus:

```sh
PROM_LIVE_URL=https://prometheus.demo.prometheus.io \
PROM_LIVE_QUERY=up \
  npm test -- prometheus.live
```

It asserts only what *any* real server must satisfy — a poll produces a garden
of well-formed plants with vitals in `[0, 1]` — never a specific value, because a
live server's numbers are not ours to pin.

**In this environment it fails with `403`,** because outbound egress is denied by
policy at the proxy (`up{}` never leaves the network boundary). That is the same
constraint `docs/sources.md` keeps flagging, now demonstrable rather than
asserted: the code reaches the socket and the socket is what is blocked. Nothing
else in the path is.

## The mapping is the source — and it is declarative

The hand-written translators (league, market, world) each decided their mapping
in code. Prometheus is regular enough that its mapping is *data* — this is the
first step toward the declarative source `docs/sources.md` sketches. A
`PromMapping` states the things the numbers cannot:

- **the scale** — what value reads as 0 and what reads as 1. `min > max`
  expresses "lower is better" (a latency, an error rate) with no extra flag; the
  arithmetic just runs backwards.
- **polarity — mandatory.** A rising error rate is a thriving weed, not a healthy
  tree, and only the operator can say which. It is a required field.
- **trend is derived** from the previous poll, never supplied. The config names
  the level; the delta is computed across refreshes.
- **`up{} == 0` is staleness the source states about itself** — it becomes a
  critical *down* blight and the plant's clock stops at its last real sample, so
  it greys as the silence it is rather than staying fresh because we asked.
- **labels are the bed grouping** (`job`, typically) and the plant name
  (`instance`).

## The one seam friction, named

`LiveSource.read(now)` is synchronous, because every source so far is a
generator. A network fetch is not. `promSource` resolves this the honest way:
`read` translates the **last snapshot it holds**, synchronously; `refresh` is the
async fetch that fills it; and the previous poll's vitality is threaded through
so trend is a real delta across refreshes.

What that leaves open is deliberate and is *not* a translator problem: something
has to *call* `refresh` on the scrape interval, and a shut browser tab cannot.
That caller is the unattended collector loop `docs/sources.md` describes — a
backend — and the observation record already stores in the shape it wants. So a
*live* Prometheus garden is `promSource` plus that loop, and `promSource` is the
whole of the part that lives in the client.

## Wired in behind a mock fetch

`promSource` is now in `state/sources.ts` — the eighth garden — pointed at a mock
instead of a server. `adapters/prometheus/mock.ts` is a `FetchLike` that answers
`/api/v1/query` from a synthetic seven-target fleet in the exact wire shape above,
so the whole path runs in the app with the socket the only thing missing. Three
things make an async fetch source fit the synchronous composition the other
sources assume:

- **Primed synchronously.** `syntheticPromSnapshot()` builds a parsed snapshot
  without the promise, and `adopt` hands it to the source before compose reads it,
  so the garden is populated on the first `read` rather than empty until a fetch
  lands.
- **`refresh` on the beat.** `LiveSource` gained an optional `refresh(now)`; the
  store's `poll` kicks it fire-and-forget for any source that has one, so the next
  beat's `read` sees the fetched snapshot. This is the mock standing in for the
  backend loop — the caller the section above says a shut tab cannot be. A fetch
  that rejects simply does not advance, and staleness greys the garden, which is
  the honest reading of a feed that went quiet.
- **Due on the scrape interval, not every beat.** `promStaleSchedule` now marks a
  target owed one interval after its last sample (and stale one interval beyond
  that), so the poll re-reads on the scrape cadence rather than continuously.

The mock fleet moves — latencies walk on a slow per-target curve, so trend is a
real delta across refreshes — and one replica is held down (`up{} == 0`, last
sample frozen in the past) so the garden exercises the staleness-and-blight read,
not just the healthy one. Swapping `mockPromFetch` for the platform `fetch` and a
real `PromQuery` endpoint is the whole of what "go live" means; the unattended
refresh loop for a shut tab remains the backend's job.
