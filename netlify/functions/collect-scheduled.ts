import { createCollectorLoop } from '../../src/backend/collectorLoop';
import type { FetchLike } from '../../src/adapters/prometheus/query';
import { registryFromEnv } from './_registry';
import { loadRecordCell } from './_blobStorage';

/**
 * The collector loop, as a Netlify Scheduled Function — the poll that runs when
 * no tab is open.
 *
 * `docs/sources.md` named this the critical-path blocker: the client's poll dies
 * with the tab, so a live garden needs the loop somewhere it outlives the page.
 * This is that somewhere. Each firing loads the record from Blobs, runs one
 * `tick` (fetch upstream, translate, observe), flushes it into the cell, and
 * writes the cell back. The whole of the logic is the tested `createCollectorLoop`;
 * this is the scheduler skin around it.
 *
 * The schedule floor on Netlify is one minute. That is fine here: the record's
 * fine tier is hourly (`state/persist.ts`), so per-minute collection is already
 * finer than anything read back. Set `PROM_SCRAPE_MS` to the real scrape interval
 * for the staleness/poll cadence within a run.
 */
export default async function handler(): Promise<void> {
  const { storage, persist } = await loadRecordCell();

  const loop = createCollectorLoop({
    registry: registryFromEnv(),
    fetchImpl: fetch as unknown as FetchLike,
    storage,
  });

  await loop.tick();
  // Force the record into the cell now rather than waiting on the write schedule —
  // the process is about to be torn down, so "later" never comes.
  loop.flush();
  await persist();
}

export const config = { schedule: '* * * * *' };
