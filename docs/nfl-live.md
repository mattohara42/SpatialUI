# The live NFL source: a real season from ESPN

The NFL garden was the first real source. Until now the only thing keeping it
from a live feed was network access, which no earlier session had. `liveNflSource`
adds that: it fetches a real season from ESPN's public API and fills the same
`NflSeasonSnapshot` the seeded generator does. The garden shows the actual league
and nothing below the adapter changes.

For background, `docs/backend.md` explains the proxy design (the NFL proxy is a
sibling of the Prometheus one), `docs/sources.md` describes the source interface
this plugs into, and `adapters/nfl/types.ts` defines the feed shapes. This file
covers what those don't: what gets fetched, what gets approximated, and how to
turn it on.

---

## Same shape as the Prometheus path

The structure copies the Prometheus source, because both plug into the same
interface:

- **`espn.ts` fetches and parses.** It calls `site.api.espn.com` and parses
  ESPN's JSON into the records defined in `types.ts`: scores from the scoreboard,
  full box-score lines from the game summary, age and experience from the roster,
  and designations from the injury report. Nothing in it knows about plants.
  `translation/nfl.ts` is still the only place football meets the garden, and
  `derive.ts` still turns box scores into standings.
- **`live.ts` wraps the async fetch in a synchronous source.** `NflSource.snapshot`
  is synchronous and a fetch isn't, so it works the same way as `promSource`:
  `read` translates the last snapshot it holds and `refresh` is the async call
  that updates it. It also accumulates. A final box score never changes, so the
  source remembers games it has already seen, and a mid-season refresh only
  fetches the new week's finals.
- **The proxy allows a fixed set of paths.** Prometheus allows one PromQL query.
  ESPN has a handful of resource paths, so `backend/nflProxy.ts` allows the four
  the adapter reads (`scoreboard`, `summary`, a club's `roster`, and its
  `injuries`) and refuses everything else. The trust boundary is the same: the
  client sends a `sourceId` and the shape of a path, never a host.
- **One variable turns it on.** `VITE_NFL_PROXY_URL` makes `state/sources.ts` use
  the live source instead of the generator, the same way `VITE_PROM_PROXY_URL`
  does for Prometheus. Without it the garden stays on the seeded season and makes
  no outbound requests.

## Why ESPN

It's free and needs no key. `site.api.espn.com` answers without a token, which
makes a live NFL garden the cheapest real feed to stand up. The proxy is there
for CORS and so the browser never names a host, not to hide a secret.

Team identity stays local. The thirty-two franchises, their divisions and their
founding years live in `teams.ts` and aren't fetched, because they change once a
decade at most. The feed only supplies the parts that move, and the layout comes
from our own data.

## What's real, and the one approximation

Every health axis comes from real data:

| axis | live input | endpoint |
| --- | --- | --- |
| vitality | record, point differential, roster availability | scoreboard + summary + injuries |
| activity | scoring pace and snaps | summary box scores |
| maturity | starter experience, roster age, franchise age | roster (+ local `founded`) |
| trend | recent form against season form, plus the streak | derived from results |

The gap is that ESPN's roster is a **list of players, not a depth chart**. It has
no `QB1`/`LT`/`CB3` slot and no reliable starter flag. Maturity reads age and
experience, which are per-player and fully available, so the axis itself is real.
What's approximated is which players count as starters: we take the most
experienced players in each position group. That shifts the starter averages a
little and never affects the league table. It's the only place a live club is
less detailed than a seeded one, and a depth-chart endpoint would fix it.

If one of the smaller fetches fails, the snapshot still goes through. The game,
roster or injury report it would have added is just missing, and the staleness
and availability readings show the gap instead of making up a number.

## Turning it on

The live source uses the same Netlify functions as Prometheus. The NFL proxy is
`netlify/functions/nfl-proxy.ts`, routed at `/api/proxy/nfl`. `docs/running-live.md`
is the runbook, including how to run it locally against real ESPN (you need
`netlify dev`, not `npm run dev`, because Vite on its own doesn't serve
functions). `docs/deploy-netlify.md` has the deploy checklist. In short:

| var | side | value |
| --- | --- | --- |
| `VITE_NFL_PROXY_URL` | client (build time) | `/api/proxy/nfl` points the source at the proxy. Leave it unset to keep the seeded season. |
| `NFL_ENDPOINT` | server | ESPN football base URL. Defaults to `https://site.api.espn.com/apis/site/v2/sports/football`. Only override it if you put your own gateway in front of ESPN. |
| `NFL_TOKEN` | server | Bearer token, only if that gateway wants one. ESPN's public feed doesn't. |

Redeploy after setting `VITE_NFL_PROXY_URL`, because it's baked into the client at
build time. Without it the deploy still works and runs the seeded season, the
same as it does locally.

## Testing without network access

Every parser is tested offline against captured ESPN responses
(`espn.fixtures.ts`, `espn.test.ts`). The live source is driven by a mock fetch
(`live.test.ts`), and the proxy's allowlist and passthrough are tested end to end
(`backend/nflProxy.test.ts`). If production returns a shape we didn't expect,
the fix is updating a fixture and loosening a parser, not rebuilding the path.

The one step the tests can't run here is the real network call, and there's a
test waiting for it. `nfl.live.test.ts` is skipped unless `NFL_LIVE_URL` is set.
Point it at ESPN or at the deployed proxy and it checks the whole path for real.
It only asserts what any real season has to satisfy (thirty-two well-formed clubs
with vitals in range, stamped `live`) and never checks a specific value:

```
NFL_LIVE_URL=https://site.api.espn.com/apis/site/v2/sports/football \
  npm test -- nfl.live
```

## Not done yet

The **unattended collector loop**. The proxy keeps the garden live while a tab is
open, pulling a fresh season through the proxy on the source's schedule. A closed
tab still collects nothing, which is the same limit `docs/backend.md` describes
for every source. For the NFL it barely matters: clubs play weekly and the
staleness window is seven days, so opening a tab once a week keeps the record
complete. Extending `collectorLoop.ts` beyond Prometheus would close the gap
properly.
