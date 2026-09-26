# CLAUDE.md: Spatial Ecosystem

Read this first, then follow the map below. It's kept short so the things that
need attention show up at the start of a session.

## Where the real documentation lives

- **`README.md`**: what the project is.
- **`HANDOFF.md`**: where things stand, the judgement calls still open, and
  what's worth doing next. **This is the main one.** It's long and kept current.
- **`ARCHITECTURE.md`**: the contracts and the recorded assumptions.
- **`DESIGN.md`**: the reading language (what wilting, weeds and grafts mean).
- **`docs/garden-builder.md`**: adding a garden at runtime.
- **`docs/running-live.md`**: running it against a real feed, and what each
  garden is actually made of.

If you edit the docs, run `npx vitest run src/docs.drift.test.ts`. It checks that
certain numbers in README, HANDOFF and ARCHITECTURE match the code, and it depends
on exact phrasings like "8 divisions" and "140 slots".

## ⚠️ Housekeeping: branch cleanup pending (2026-08-31)

A branch audit across twelve repos found **nothing here worth merging** and no
open PRs. This repo was the cleanest of the twelve. The remote has eighteen stale
`claude/*` branches. Seventeen are already fully contained in `main`, and one has
a commit of its own (see below), which is why this says "worth merging" and not
"unmerged".

Their pull requests were merged with **merge commits**, so each of the seventeen
tips is an ancestor of `main` and `git rev-list --count origin/main..<branch>` is
zero. The only thing keeping them around is the repository setting mentioned at
the end. Check each one with `git merge-base --is-ancestor <branch> origin/main`
before deleting instead of trusting this list:

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
git push origin --delete claude/nfl-visuals-enhancement-cespem      # was 963ae21
git push origin --delete claude/plant-health-visual-indicators-mt7d55 # was 078d25f
git push origin --delete claude/real-source-approach-2mte9z         # was 3f55dc8
git push origin --delete claude/repo-metadata-kopscy                # was bfab5ce
git push origin --delete claude/shipping-docs-checklist-oc14q9      # was f47d0a4
git push origin --delete claude/test-real-world-data-sources-h724dx # was 7dea782
git push origin --delete claude/textures-details-xzztig             # was 12d42b8
git push origin --delete claude/unattended-work-queue-gw618t        # was 2ece60e
git push origin --delete claude/whats-next-c1xph0                   # was 1fb1231
```

`claude/keep-going-1tev9a` is the exception and the only one that **isn't** an
ancestor of `main`. It has one commit that never landed: `85082bd`, a docs
reconcile of `README`, `ARCHITECTURE` and `DESIGN` from 2026-08-08. Those three
files have been rewritten many times since, so it's superseded, not pending, and
merging it now would undo later work. (It falls further behind `main` with every
merge, so there's no count quoted here. Ask git.)

That makes it the one deletion you **can't freely undo**. For the others the
commits live in `main` anyway, so the branch can be recreated from history at any
time. `85082bd` exists nowhere else, and once the branch is gone the commit is
unreferenced and will eventually be garbage-collected. If in doubt, keep a copy
first:

```
git fetch origin claude/keep-going-1tev9a
git tag archive/keep-going-1tev9a 85082bd && git push origin archive/keep-going-1tev9a
```

Recreating any of the others is just `git push origin <sha>:refs/heads/<branch>`.

Turning on **Settings → General → "Automatically delete head branches"** stops
these piling up.

## Something you don't need to rediscover

The container has **no outbound network**. `api.worldbank.org`,
`feeds.bbci.co.uk`, `aljazeera.com` and Prometheus's own demo all get a 403 at the
proxy CONNECT. That's the network policy, not a broken setup, and it's why the
Prometheus adapter fetches through a mock that answers `/api/v1/query` in the exact
wire format a real server uses. Don't debug it as if it were a bug.

According to `HANDOFF.md`, the most valuable thing left is running one of the two
built live paths (Prometheus, or the NFL through the backend proxy to ESPN) against
a real server in a networked deploy.
