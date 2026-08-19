# The live NFL source — a real season from ESPN

The NFL garden was the first real source, and until now the only thing standing
between it and a live feed was the socket every prior session lacked. This is the
socket: `liveNflSource` fetches a real season from ESPN's public API and fills the
same `NflSeasonSnapshot` the seeded generator did, so the garden shows the actual
league without an inch of change below the adapter.

Read `docs/backend.md` for why the proxy is shaped the way it is (the NFL proxy is
its sibling), `docs/sources.md` for the seam this walks, and `adapters/nfl/types.ts`
for the feed shapes. This file is the part those do not carry: what is fetched,
what is approximated, and how to turn it on.

---

## The shape, matched to the Prometheus path

Everything here mirrors the source Prometheus already proved, because the seam is
the same one:

- **`espn.ts` is the fetch/parse half.** It talks HTTP to `site.api.espn.com` and
  parses ESPN's wire JSON into the records `types.ts` defines — scores from the
  scoreboard, full box-score lines from the game summary, age and experience from
  the roster, designations from the injury report. Nothing in it knows what a
  plant is; `translation/nfl.ts` is still the only place football meets the
  garden, and `derive.ts` still turns box scores into standings.
- **`live.ts` is the sync source over an async fetch.** `NflSource.snapshot` is
  synchronous and a fetch is not, so — exactly as `promSource` does — `read`
  translates the last snapshot it holds and `refresh` is the async call that fills
  it. It accumulates: a final box score never changes, so the source remembers the
  games it has seen and a mid-season refresh fetches only the new week's finals,
  not the whole season.
- **The proxy is a path allowlist.** Prometheus permits one PromQL; ESPN is a
  handful of resource paths, so `backend/nflProxy.ts` permits the four the adapter
  reads (`scoreboard`, `summary`, a club's `roster`, its `injuries`) and refuses
  everything else. Same trust boundary: the client names a `sourceId` and a path
  *shape*, never a host.
- **One switch turns it on.** `VITE_NFL_PROXY_URL` selects the live source over the
  generator in `state/sources.ts`, the same way `VITE_PROM_PROXY_URL` does for
  Prometheus. Unset, the garden stays the seeded season and needs no egress.

## Why ESPN

Free and keyless. `site.api.espn.com` answers without a token, so a live NFL
garden is the cheapest real feed to stand up — the proxy is there for CORS and to
keep the browser from naming a host, not to hold a secret. Identity stays local:
the thirty-two franchises, their alignment, and their founding years live in
`teams.ts` and are *not* fetched, because those change once a decade or never, so
the feed supplies only the parts that move and the layout is ground truth.

## What is real, and the one thing that is approximated

Every health axis is fed from real data:

| axis | live input | endpoint |
| --- | --- | --- |
| vitality | record, point differential, roster availability | scoreboard + summary + injuries |
| activity | scoring pace and snaps | summary box scores |
| maturity | starter experience, roster age, franchise age | roster (+ local `founded`) |
| trend | recent form against season form, plus the streak | derived from results |

The one honest gap: ESPN's roster is a **list of players, not a depth chart**, so
it carries no `QB1`/`LT`/`CB3` slot and no reliable starter flag. Maturity reads
age and experience — both per-player, both fully fed — so the axis is real; what is
approximated is the *starter split*, derived by taking the most experienced players
in each position group as the starters. That moves the starter-average terms a
little, never the league table, and it is the only place a live club is coarser
than a seeded one. A depth-chart endpoint would close it.

A sub-fetch that fails does not sink the snapshot: the game, roster, or report it
would have added is simply absent, and staleness and availability read the gap
honestly rather than inventing a number.

## Turning it on

The live source rides the same Netlify shells Prometheus does; the NFL proxy is
`netlify/functions/nfl-proxy.ts`, routed at `/api/proxy/nfl`. See
`docs/deploy-netlify.md` for the full checklist. The short version:

| var | side | value |
| --- | --- | --- |
| `VITE_NFL_PROXY_URL` | client (build-time) | `/api/proxy/nfl` — points the source at the proxy. Unset keeps the seeded season. |
| `NFL_ENDPOINT` | server | ESPN football base. Defaults to `https://site.api.espn.com/apis/site/v2/sports/football`; override only to front ESPN with your own gateway. |
| `NFL_TOKEN` | server | Bearer token, only if that gateway wants one. ESPN's public feed does not. |

Redeploy after setting `VITE_NFL_PROXY_URL` — it is baked into the client at build
time. With it unset the deploy still works; it just runs the seeded season, exactly
as it does locally.

## Verifying without egress, and the one hop that needs it

Every parser is pinned offline against captured ESPN shapes (`espn.fixtures.ts`,
`espn.test.ts`), the live source's seam is driven by a mock fetch (`live.test.ts`),
and the proxy's allowlist and passthrough are tested end to end
(`backend/nflProxy.test.ts`). So a shape surprise in production is a fixture to
update and a parser to widen, not a path to rebuild.

The one hop the tests cannot run here is the socket, and it has a tripwire:
`nfl.live.test.ts` is `skipIf` no `NFL_LIVE_URL`. Point it at ESPN (or the deployed
proxy) and it certifies the whole path for real, asserting only what any real
season must satisfy — thirty-two well-formed clubs with vitals in range, stamped
`live` — never a specific value:

```
NFL_LIVE_URL=https://site.api.espn.com/apis/site/v2/sports/football \
  npm test -- nfl.live
```

## What is not here yet

The **unattended collector loop**. The proxy makes the garden live while a tab is
open — it pulls a fresh season through the proxy on the source's cadence — but a
shut tab still collects nothing, the same limit `docs/backend.md` draws for every
source. For the NFL that limit bites gently: clubs play weekly, so the seven-day
staleness window means a tab open once a week keeps the record whole. Generalizing
`collectorLoop.ts` past Prometheus is the follow-up that closes it for good.
