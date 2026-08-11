import { promRegistry, type RegisteredPromSource } from '../../src/backend/registry';
import type { PromMapping } from '../../src/translation/prometheus';
import type { Domain, Polarity } from '../../src/ecosystem/types';
import type { PlantingType } from '../../src/ecosystem/planting';

/**
 * The registry, built from server-side environment — the allowlist's operator
 * face.
 *
 * The client only ever names the source id `prometheus` (see `PROM_SOURCE_ID` in
 * `state/sources.ts`); everything a request needs to actually reach a server —
 * the endpoint, the bearer token, the query it is allowed to run — lives here, in
 * Netlify's environment, never in the bundle. Set these in the Netlify UI or
 * `netlify env:set` (see `docs/deploy-netlify.md`).
 *
 * The leading underscore keeps Netlify from publishing this as its own function
 * endpoint; it is a shared module the two real functions import.
 */

// `process` exists in the functions runtime; the app deliberately carries no
// `@types/node`, and these files live outside the app's `tsc` include anyway.
declare const process: { env: Record<string, string | undefined> };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env ${name}`);
  return value;
}

export function registryFromEnv() {
  const source: RegisteredPromSource = {
    // Must match the client's PROM_SOURCE_ID — the name the proxy POST carries.
    id: 'prometheus',
    query: {
      baseUrl: required('PROM_ENDPOINT'),
      query: required('PROM_QUERY'),
      includeUp: process.env.PROM_INCLUDE_UP !== 'false',
      token: process.env.PROM_TOKEN,
    },
    mapping: mappingFromEnv(),
    scrapeIntervalMs: Number(process.env.PROM_SCRAPE_MS ?? '60000'),
  };
  return promRegistry([source]);
}

/**
 * The one genuinely operator-owned decision, per `docs/sources.md`: what a value
 * *means* as health. `vitality` has no sane default, so it is required; the rest
 * carry the sensible devops defaults the mock shipped with.
 */
function mappingFromEnv(): PromMapping {
  return {
    gardenId: 'prometheus',
    gardenLabel: process.env.PROM_LABEL ?? 'Prometheus',
    idLabel: process.env.PROM_ID_LABEL ?? 'instance',
    bedLabel: process.env.PROM_BED_LABEL ?? 'job',
    // Latency-shaped default (lower is better), so the scale runs backwards.
    // Override for a metric where higher is healthier (e.g. `up`: 0 -> 1).
    vitality: {
      min: Number(required('PROM_VITALITY_MIN')),
      max: Number(required('PROM_VITALITY_MAX')),
    },
    polarity: (process.env.PROM_POLARITY as Polarity) ?? 'nurture',
    planting: (process.env.PROM_PLANTING as PlantingType) ?? 'conifer-stand',
    domain: (process.env.PROM_DOMAIN as Domain) ?? 'devops',
  };
}
