# Running it for real

How to run the app against a real feed, locally and deployed, and what you
actually get when you do.

`docs/nfl-live.md` explains how the live NFL source is built and why. This file
is the runbook: the commands, the switches, and the things that will trip you up
if nobody warns you.

---

## What's actually real

Settle this first. "Run it live" means four different things across the nine
gardens, and only one of them talks to the outside world.

| garden | what it is made of | real? |
| --- | --- | --- |
| **NFL** | `adapters/nfl` → ESPN's public API, through the backend proxy | **yes, with `VITE_NFL_PROXY_URL` set** |
| **Prometheus** | `adapters/prometheus` → a mock fetch answering in the real wire shape | yes, with `VITE_PROM_PROXY_URL` set; otherwise a mock |
| **Markets** | `adapters/market` → a seeded tape generated in-process | no: synthetic data, real pipeline |
| **World** | `adapters/world` + `adapters/news` → generated in-process | no: synthetic data, real pipeline |
| Infrastructure, Vault, Threats, Pipelines, Portfolio | `mock/` → hand-written shapes moved by a drift tick | no: hand-written |

Don't write off Markets and World. They aren't mocks in the same sense as the
bottom row. They run the same adapter → translation → store path a real feed
would, and the only synthetic part is where the records come from. That's why
they exist: they prove the layering works independently, so plugging in a real
feed only means changing the source.

The bottom five are hand-written data with a random walk on top. They're for
tuning the renderer, and you probably don't want them sitting next to a live
feed.

### Dropping the hand-written gardens

```
VITE_MOCK_GARDENS=false
```

This drops the bottom five and keeps everything that comes through an adapter
and a translator. It defaults to **on**, so dev, tests and existing deploys
don't change unless you turn it off.

It can't make the remaining gardens real. It only separates hand-written data
from pipeline data, because that's the distinction the code actually has.

---

## Locally, against real ESPN

### Why `npm run dev` isn't enough

The client never talks to ESPN directly, and it isn't allowed to: that would be a
cross-origin request to a third party with no CORS agreement. Instead it POSTs
`{ sourceId, path }` to a proxy. The proxy looks up the id in a server-side
registry, checks the path against an allowlist, and passes ESPN's JSON back
unchanged.

That proxy is a **Netlify Function** (`netlify/functions/nfl-proxy.ts`, routed
at `/api/proxy/nfl` by its own `config.path`). `npm run dev` only runs Vite,
which serves the client and knows nothing about functions. `/api/proxy/nfl`
doesn't exist there and every fetch fails. You need something that runs both.

### The steps

1. **Install the Netlify CLI.** It runs Vite and the functions together and
   routes between them:

   ```bash
   npm install -g netlify-cli
   ```

2. **Create a `.env`** in the repository root:

   ```bash
   VITE_NFL_PROXY_URL=/api/proxy/nfl
   ```

   That's all ESPN's public feed needs. `NFL_ENDPOINT` defaults to ESPN, and
   `NFL_TOKEN` is only for a deploy that puts its own auth gateway in front of
   ESPN. `.env` is gitignored. Keep it that way, since a token would live there.

   Add `VITE_MOCK_GARDENS=false` as well if you want only the live set locally.

3. **Run it:**

   ```bash
   netlify dev
   ```

   It prints a port (8888 by default). Open that one, **not** Vite's port. The
   Vite port is still running with no functions behind it, and opening it by
   mistake is the easiest way to lose ten minutes.

4. **Check it worked.** The NFL tab should appear a few seconds after the page
   loads, not instantly (see the cold start note below). In the browser's Network
   tab you should see a `POST` to `/api/proxy/nfl` returning 200 with ESPN's JSON.

### Testing the whole path

There's a live test that's skipped unless you give it a URL:

```bash
NFL_LIVE_URL=https://site.api.espn.com/apis/site/v2/sports/football \
  npm test -- nfl.live
```

It only asserts what any real season has to satisfy (thirty-two well-formed clubs
with vitals in range, stamped `live`) and never checks a specific value, so it
doesn't break as the season moves on.

---

## Deployed

`docs/deploy-netlify.md` has the full checklist. In short, the same two
variables do the same two things, set in Netlify's UI instead of a `.env`:

| var | value |
| --- | --- |
| `VITE_NFL_PROXY_URL` | `/api/proxy/nfl` |
| `VITE_MOCK_GARDENS` | `false`, if you only want the pipeline gardens |

**Both are baked into the client at build time**, so changing either one needs a
**redeploy**, not just a save. A variable changed in the UI without a new build
does nothing, and that looks exactly like the variable being broken.

---

## Things that will trip you up

**The NFL garden is missing for the first second or two on every load.** The live
source has no snapshot until its first fetch returns, and it deliberately shows
nothing instead of inventing a season. The garden buttons are built by filtering
nodes by garden, so the **tab is missing**, not empty, until ESPN replies. A slow
function cold start makes this longer. If the tab never shows up, the fetch is
failing, so check the Network tab instead of waiting.

**It used to never appear.** Before the cold-start fix, a live source that had
never answered was never polled. Whether a source was due for a reading was
worked out from the newest plant already in its garden, and there weren't any. No
nodes meant it was never due, which meant no refresh, which meant no nodes. If
you're on an older build and the NFL tab never shows up, that's the reason.
`src/state/liveColdStart.test.ts` covers it.

**A refresh is due weekly, not continuously.** Clubs play weekly, so the league's
staleness window is seven days. Once the garden has loaded it won't re-fetch
while you watch. That's correct behaviour.

**Nothing is collected while the tab is closed.** The proxy keeps the garden live
while someone is looking at it, but the unattended collector loop still only
handles Prometheus. For a weekly feed that barely matters, since opening a tab
once a week keeps the record complete, but it is a real limit. See
`docs/backend.md`.

**The seeded season is the fallback, not an error.** With `VITE_NFL_PROXY_URL`
unset you get a generated season and no network traffic at all. That's the right
default for development and for anyone who clones the repo, and it's what every
test runs against.
