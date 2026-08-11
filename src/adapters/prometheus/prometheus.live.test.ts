import { describe, expect, it } from 'vitest';
import { promSource } from './index';

/**
 * The live end-to-end test — the actual answer to "how do we test out a
 * real-world data source".
 *
 * It is skipped unless `PROM_LIVE_URL` names a reachable Prometheus, because
 * this environment's egress is policy-restricted and the deterministic suites
 * above already pin every shape against captured responses. Point it at a real
 * server and it runs the whole path for real:
 *
 *   PROM_LIVE_URL=https://prometheus.demo.prometheus.io \
 *   PROM_LIVE_QUERY=up npm test -- prometheus.live
 *
 * When it runs, it asserts only what any real Prometheus must satisfy — that a
 * poll produces a garden of well-formed nodes with vitals in range — never a
 * specific value, because a live server's numbers are not ours to pin.
 */

// Minimal local shape rather than a whole @types/node dependency, which this
// project deliberately does without. `process` exists at runtime under vitest.
declare const process: { env: Record<string, string | undefined> };

const url = process.env.PROM_LIVE_URL;
const query = process.env.PROM_LIVE_QUERY ?? 'up';

// `describe.skipIf` keeps the offline run green and the intent visible, rather
// than deleting the test or hiding it behind a comment.
describe.skipIf(!url)(`live Prometheus at ${url ?? '(unset)'}`, () => {
  it('polls a real server and produces a valid garden', async () => {
    const source = promSource({
      query: { baseUrl: url!, query, includeUp: true },
      mapping: {
        gardenId: 'prom-live',
        gardenLabel: 'Live Prometheus',
        idLabel: 'instance',
        bedLabel: 'job',
        // `up` is 0 or 1: 1 is the whole of health. For another metric, pass a
        // scale that suits it via PROM_LIVE_QUERY and edit here.
        vitality: { min: 0, max: 1 },
        polarity: 'nurture',
      },
    });

    await source.refresh(Date.now());
    expect(source.snapshot?.provenance.kind).toBe('live');

    const garden = source.read(Date.now());
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    expect(plants.length).toBeGreaterThan(0);

    for (const plant of plants) {
      expect(plant.vitality).toBeGreaterThanOrEqual(0);
      expect(plant.vitality).toBeLessThanOrEqual(1);
      expect(plant.gardenId).toBe('prom-live');
      expect(plant.emblem).toBeDefined();
    }
  }, 30_000);
});
