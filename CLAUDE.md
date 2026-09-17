# CLAUDE.md — Spatial Ecosystem

Read this first, then follow the map below. This file is deliberately short —
it exists so that what needs attention surfaces at session start.

## Where the real documentation lives

- **`README.md`** — what the project is.
- **`HANDOFF.md`** — the state of play, the judgement calls still open, and
  what's worth doing next. **This is the main one**; it's long and current.
- **`ARCHITECTURE.md`** — the contracts and the recorded assumptions.
- **`DESIGN.md`** — the reading language (what wilting, weeds and grafts mean).
- **`docs/garden-builder.md`** — adding a garden at runtime.
- **`docs/running-live.md`** — standing it up against a real feed, and what
  each garden is actually made of.

## ⚠️ Housekeeping — branch cleanup pending (2026-08-31)

A cross-repo branch audit found **no work worth merging here** and no open PRs.
This repo was the cleanest of the twelve: 15 of its 16 branches are fully
contained in `main` already. The sixteenth does carry a commit of its own, which
is why the phrasing is "worth merging" rather than "unmerged" — see below.

Sixteen stale refs to delete. Fifteen are ordinary merged branches: their pull
requests were merged with **merge commits**, so each tip is literally an
ancestor of `main` and `git rev-list --count origin/main..<branch>` is zero.
Nothing keeps them here but the repository setting below. Check any of them with
`git merge-base --is-ancestor <branch> origin/main` before deleting, rather than
trusting this list:

```
git push origin --delete claude/artifact-session-eebefe             # was ffb3e81
git push origin --delete claude/continue-r67txn                     # was 4dc12aa
git push origin --delete claude/end-user-ui-483r6n                  # was 745c73b
git push origin --delete claude/garden-builder-remaining-bwokw2     # was c085bbf
git push origin --delete claude/geopolitical-garden-data-4ghypf     # was 33718f3
git push origin --delete claude/greenhouse-garden-scene-8k87wj      # was 9c29f1a
git push origin --delete claude/keep-going-1tev9a                   # was 85082bd
git push origin --delete claude/nfl-data-structure-z3572a           # was e7ffece
git push origin --delete claude/nfl-dataset-testing-qaep4e          # was 00f5261
git push origin --delete claude/real-source-approach-2mte9z         # was 3f55dc8
git push origin --delete claude/repo-metadata-kopscy                # was bfab5ce
git push origin --delete claude/shipping-docs-checklist-oc14q9      # was f47d0a4
git push origin --delete claude/test-real-world-data-sources-h724dx # was 7dea782
git push origin --delete claude/textures-details-xzztig             # was 12d42b8
git push origin --delete claude/unattended-work-queue-gw618t        # was 2ece60e
git push origin --delete claude/whats-next-c1xph0                   # was 1fb1231
```

`claude/keep-going-1tev9a` is the sixteenth, and the only one that is **not** an
ancestor of `main`. It carries one commit of its own that never landed: `85082bd`,
a 2026-08-08 docs reconcile of `README`/`ARCHITECTURE`/`DESIGN`. Those three files
have been rewritten repeatedly since — it is superseded, not pending, and merging
it now would regress them. (It runs further behind `main` with every merge, so no
count is quoted here; ask git.)

Being the odd one out makes it the one deletion that is **not freely reversible**.
For the other fifteen the commit lives in `main` regardless, so the ref can be
recreated from history at any time. `85082bd` exists nowhere else, and once the
ref is gone it is unreferenced and eventually collectable. If there is any doubt,
keep a copy first:

```
git fetch origin claude/keep-going-1tev9a
git tag archive/keep-going-1tev9a 85082bd && git push origin archive/keep-going-1tev9a
```

Recreating any of the others is just `git push origin <sha>:refs/heads/<branch>`.

Enabling **Settings → General → "Automatically delete head branches"** stops
these accumulating.

## One thing worth not re-deriving

The container has **no outbound network** — `api.worldbank.org`,
`feeds.bbci.co.uk`, `aljazeera.com` and Prometheus's own demo all answer 403 at
the proxy CONNECT. That's egress policy, not a broken setup, and it's why the
Prometheus adapter fetches through a mock that answers `/api/v1/query` in the
exact wire shape a real server returns. Don't debug it as if it were a bug.

Per `HANDOFF.md`, standing one of the two built live paths (Prometheus, or the
NFL via the backend proxy to ESPN) against a real socket in a networked deploy
is the single highest-value thing left.
