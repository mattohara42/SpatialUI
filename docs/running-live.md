# Running it for real

How to stand the app up against a real feed, locally and deployed, and what you
actually get when you do.

`docs/nfl-live.md` explains how the live NFL source is built and why. This file
is the runbook: the commands, the switches, and the things that will confuse you
if nobody says them first.

---

## What is actually real

Worth settling before anything else, because "run it live" turns out to mean
four different things across eight gardens, and the honest answer is that only
one of them reaches the world.

| garden | what it is made of | real? |
| --- | --- | --- |
| **NFL** | `adapters/nfl` → ESPN's public API, through the backend proxy | **yes, with `VITE_NFL_PROXY_URL` set** |
| **Prometheus** | `adapters/prometheus` → a mock fetch answering in the real wire shape | yes, with `VITE_PROM_PROXY_URL` set; otherwise a mock |
| **Markets** | `adapters/market` → a seeded tape generated in-process | no: synthetic data, real pipeline |
| **World** | `adapters/world` + `adapters/news` → generated in-process | no: synthetic data, real pipeline |
| Infrastructure, Vault, Threats, Pipelines, Portfolio | `mock/` → hand-written shapes moved by a drift tick | no: hand-written |

The middle two are worth understanding rather than dismissing. Markets and World
are *not* mocks in the way the bottom row is: they run the same adapter →
translation → store path a real feed runs, and the only synthetic thing about
them is where the records come from. That is the whole point of them — they are
the independent test that the layering works, which is why swapping in a real
feed is a change of source and nothing else.

The bottom five are hand-written data with a random walk over it. They exist to
tune the renderer against, and they are the ones you probably do not want
standing beside a live feed.

### Dropping the hand-written gardens

```
VITE_MOCK_GARDENS=false
```

Drops the bottom five and keeps everything that comes through an adapter and a
translator. It defaults to **on**, so dev, tests and any existing deploy are
unchanged unless you opt out.

It cannot make the remaining gardens real. It draws the line at hand-written
versus pipeline, which is the line the code actually has.

---

## Locally, against real ESPN

### Why `npm run dev` is not enough

The client never talks to ESPN directly, and it is not allowed to: the browser
would be making a cross-origin request to a third party with no CORS agreement.
It POSTs `{ sourceId, path }` to a proxy instead, which resolves the id against a
server-side registry, checks the path against an allowlist, and passes ESPN's
JSON back untouched.

That proxy is a **Netlify Function** (`netlify/functions/nfl-proxy.ts`, routed at
`/api/proxy/nfl` by its own `config.path`). `npm run dev` runs Vite alone, which
serves the client and knows nothing about functions, so `/api/proxy/nfl` does not
exist and every fetch fails. You need something that runs both.

### The steps

1. **Install the Netlify CLI**, which runs Vite and the functions together and
   routes between them:

   ```bash
   npm install -g netlify-cli
   ```

2. **Create a `.env`** in the repository root:

   ```bash
   VITE_NFL_PROXY_URL=/api/proxy/nfl
   ```

   That is the whole of it for ESPN's public feed. `NFL_ENDPOINT` defaults to
   ESPN and `NFL_TOKEN` is only for a deploy that fronts ESPN with an auth
   gateway of its own. `.env` is gitignored; keep it that way, because a token
   would live there.

   Add `VITE_MOCK_GARDENS=false` here too if you want the live set locally.

3. **Run it:**

   ```bash
   netlify dev
   ```

   It prints a port (8888 by default). Open that, **not** Vite's own port — the
   Vite port is still there and still has no functions behind it, which is the
   easiest way to spend ten minutes confused.

4. **Confirm it worked.** The NFL tab should appear within a few seconds of load,
   not instantly: see the cold start below. In the Network tab you should see a
   `POST` to `/api/proxy/nfl` returning 200 with ESPN's JSON.

### Certifying the whole path

There is a live test, skipped unless you point it at a socket:

```bash
NFL_LIVE_URL=https://site.api.espn.com/apis/site/v2/sports/football \
  npm test -- nfl.live
```

It asserts only what any real season must satisfy — thirty-two well-formed clubs
with vitals in range, stamped `live` — never a specific value, so it does not go
stale as the season moves.

---

## Deployed

`docs/deploy-netlify.md` has the full checklist. The short version is that the
same two variables do the same two things, set in Netlify's UI rather than a
`.env`:

| var | value |
| --- | --- |
| `VITE_NFL_PROXY_URL` | `/api/proxy/nfl` |
| `VITE_MOCK_GARDENS` | `false`, if you want only the pipeline gardens |

**Both are baked into the client at build time**, so setting either one needs a
**redeploy**, not just a save. A variable changed in the UI and not followed by a
build does nothing at all, which looks exactly like the variable not working.

---

## Things that will confuse you

**The NFL garden is empty for the first second or two, every load.** The live
source holds no snapshot until its first fetch answers, and it deliberately
translates to nothing rather than inventing a season. Because the garden buttons
are built by filtering nodes for a garden, that means the **tab is absent**, not
empty, until ESPN replies. A slow cold start on the function makes this longer.
If the tab never appears at all, the fetch is failing — check the Network tab
rather than waiting.

**It used to never appear.** Before the cold-start fix, a live source that had
never answered was never polled, because whether a source is owed a reading was
computed from the freshest plant already in its garden and there were none. No
nodes meant never due, never due meant no refresh, no refresh meant no nodes. If
you are running an older build and the NFL tab is missing permanently, that is
why; `src/state/liveColdStart.test.ts` pins it.

**A refresh is due weekly, not continuously.** The league's staleness window is
seven days because clubs play weekly. Once the garden has populated, it will not
re-fetch while you watch it, and that is correct rather than broken.

**Nothing collects while the tab is shut.** The proxy makes the garden live while
someone is looking at it; the unattended collector loop is still Prometheus-only.
For a weekly feed that limit bites gently — a tab open once a week keeps the
record whole — but it is a limit. See `docs/backend.md`.

**The seeded season is the fallback, not an error.** With `VITE_NFL_PROXY_URL`
unset you get a generated season with no egress at all. That is the right default
for development and for anyone who clones the repo, and it is what every test
runs against.
