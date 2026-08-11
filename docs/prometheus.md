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
live Prometheus garden is `promSource` plus that loop, and `promSource` is the
whole of the part that lives in the client. It is intentionally not added to
`state/sources.ts` yet, because wiring it live is that backend's job, not this
source's.
