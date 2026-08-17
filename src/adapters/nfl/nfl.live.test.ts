import { describe, expect, it } from 'vitest';
import { liveNflSource } from './live';

/**
 * The live end-to-end test — the real answer to "let's test the NFL dataset in a
 * production environment".
 *
 * Skipped unless `NFL_LIVE_URL` names a reachable base, because this environment's
 * egress is policy-restricted and the deterministic suites already pin every ESPN
 * shape against captured responses. Point it at ESPN directly, or at the backend
 * proxy a deploy stands up, and it runs the whole path for real:
 *
 *   NFL_LIVE_URL=https://site.api.espn.com/apis/site/v2/sports/football \
 *     npm test -- nfl.live
 *
 * When it runs, it asserts only what any real season must satisfy — a garden of
 * well-formed clubs with vitals in range, stamped `live` — never a specific
 * value, because a live feed's numbers are not ours to pin. It fetches results
 * only (`includeRosters`/`includeInjuries` off) so the trial is a handful of
 * requests, not sixty-odd.
 */

// Minimal local shape rather than an `@types/node` dependency the app does
// without. `process` exists at runtime under vitest.
declare const process: { env: Record<string, string | undefined> };

const url = process.env.NFL_LIVE_URL;

describe.skipIf(!url)(`live NFL feed at ${url ?? '(unset)'}`, () => {
  it('fetches a real season and produces a valid garden', async () => {
    const source = liveNflSource({
      baseUrl: url!,
      includeRosters: false,
      includeInjuries: false,
    });

    await source.refresh(Date.now());
    expect(source.snapshot?.provenance.kind).toBe('live');

    const garden = source.read(Date.now());
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    // Even week one has every club laid out; results only affect their health.
    expect(plants.length).toBe(32);

    for (const plant of plants) {
      expect(plant.vitality).toBeGreaterThanOrEqual(0);
      expect(plant.vitality).toBeLessThanOrEqual(1);
      expect(plant.gardenId).toBe('nfl');
      expect(plant.emblem).toBeDefined();
    }
  }, 60_000);
});
