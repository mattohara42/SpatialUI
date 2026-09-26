# Testing a real-world data source: Prometheus

`docs/sources.md` calls Prometheus the source the whole idea was built for, and
the right one to connect first. This file records how far we got building it
here, and how you test a real source when the environment blocks outbound
traffic.

The short answer is that the source is written so a networked run only adds a
real socket. Wire parsing, mapping and translation to nodes all run offline
against captured responses. The live end-to-end test switches on as soon as a
real server is reachable.

## The three layers, and where each is tested

| layer | file | tested by |
| --- | --- | --- |
| fetch + parse the wire | `adapters/prometheus/query.ts` | `query.test.ts`, against captured `/api/v1/query` responses |
| the mapping → nodes | `translation/prometheus.ts` | `translation/prometheus.test.ts` |
| the whole path, live | `adapters/prometheus/index.ts` (`promSource`) | `prometheus.live.test.ts`, against a real server |

The captured responses (`adapters/prometheus/fixtures.ts`) use the exact wire
shape a real Prometheus returns: the value is a string, the timestamp is in
seconds, and labels sit under `metric`. A fixture and a live server therefore
produce byte-identical `PromSnapshot`s, and the translator can't tell them apart.

## Running the live test

The deterministic suites run anywhere with no network. The live test is skipped
unless you point it at a real Prometheus:

```sh
PROM_LIVE_URL=https://prometheus.demo.prometheus.io \
PROM_LIVE_QUERY=up \
  npm test -- prometheus.live
```

It only asserts what any real server has to satisfy: a poll produces a garden of
well-formed plants with vitals in `[0, 1]`. It never checks a specific value,
because we don't control a live server's numbers.

**In this environment it fails with `403`.** Outbound traffic is denied by policy
at the proxy, so the `up{}` query never leaves the network. That's the same
constraint `docs/sources.md` keeps mentioning, and this test shows it directly:
the code gets as far as the socket, and the socket is the only thing blocked.

## The mapping is declarative

The hand-written translators (league, market, world) each define their mapping
in code. Prometheus is regular enough that its mapping can be data, which is the
first step toward the declarative source sketched in `docs/sources.md`. A
`PromMapping` states the things the numbers can't tell you:

- **The scale.** Which value reads as 0 and which reads as 1. Setting `min > max`
  means "lower is better" (latency, error rate) without a separate flag, because
  the arithmetic just runs backwards.
- **Polarity, which is required.** A rising error rate should grow a thriving
  weed, not a healthy tree, and only the operator knows which way a metric
  points.
- **Trend is derived** from the previous poll and never supplied. The config
  names the level and the delta is computed across refreshes.
- **`up{} == 0` means the target says it's down.** It becomes a critical *down*
  blight, and the plant's clock stops at its last real sample. The plant greys
  out like any other silence instead of looking fresh just because we asked.
- **Labels give the grouping.** Usually `job` becomes the bed and `instance`
  becomes the plant name.

## The one awkward fit

`LiveSource.read(now)` is synchronous because every earlier source was a
generator. A network fetch isn't. `promSource` handles this by splitting the
work: `read` synchronously translates the last snapshot it holds, `refresh` is
the async fetch that updates that snapshot, and the previous poll's vitality is
carried forward so trend is a real delta between refreshes.

That leaves one gap on purpose, and it isn't a translation problem. Something
has to call `refresh` on the scrape interval, and a closed browser tab can't. That
caller is the unattended collector loop described in `docs/sources.md`, which
means a backend. The observation record is already stored in the shape that loop
needs. A live Prometheus garden is `promSource` plus that loop, and `promSource`
is all of the client-side part.

## Wired in behind a mock fetch

`promSource` is registered in `state/sources.ts` as a garden of its own, pointed at
a mock instead of a server. `adapters/prometheus/mock.ts` is a `FetchLike` that
answers `/api/v1/query` from a synthetic seven-target fleet, in the same wire
shape described above. The whole path runs in the app and only the socket is
missing. Three changes let an async source fit the synchronous composition the
other sources assume:

- **It's primed synchronously.** `syntheticPromSnapshot()` builds a parsed
  snapshot without a promise, and `adopt` hands it to the source before compose
  reads it. The garden is populated on the first `read` instead of sitting empty
  until a fetch lands.
- **`refresh` runs on the beat.** `LiveSource` gained an optional `refresh(now)`.
  The store's `poll` fires it without awaiting for any source that has one, so
  the next beat's `read` sees the new snapshot. Here the mock stands in for the
  backend loop that a closed tab can't provide. A rejected fetch just doesn't
  advance, and the garden greys out from staleness, which is the right reading of
  a feed that went quiet.
- **It's due on the scrape interval, not every beat.** `promStaleSchedule` marks
  a target as owed one interval after its last sample, and stale one interval
  after that. The poll re-reads at the scrape cadence instead of continuously.

The mock fleet moves. Latencies drift on a slow per-target curve, so trend is a
real delta between refreshes. One replica is held down (`up{} == 0`, with its
last sample frozen in the past) so the garden shows the staleness and blight
reading as well as the healthy one. Going live means swapping `mockPromFetch` for
the platform `fetch` and pointing it at a real `PromQuery` endpoint. Refreshing
while the tab is closed is still the backend's job.
