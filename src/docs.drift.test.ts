/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// The docs are read through Vite's `?raw` loader rather than node's `fs`: this
// project carries no `@types/node`, and the test runs in Vite's transform
// pipeline anyway, so a raw import is the honest way to get the file contents as
// a string with nothing added to the dependency list.
import README from '../README.md?raw';
import ARCHITECTURE from '../ARCHITECTURE.md?raw';
import HANDOFF from '../HANDOFF.md?raw';

import { DEFAULT_CAPACITY, DEFAULT_ARCHIVE_CAPACITY } from './ecosystem/history';
import { generateNflSnapshot } from './adapters/nfl';
import { translateNflSnapshot } from './translation/nfl';
import { generateMarketSnapshot } from './adapters/market';
import { translateMarketSnapshot } from './translation/market';
import { generateWorldSnapshot } from './adapters/world';
import { translateWorldSnapshot } from './translation/world';
import type { EcosystemNode } from './ecosystem/types';

/**
 * Docs drift, and CI does not catch it. Every check in `.github/workflows/ci.yml`
 * verifies the *code*; the prose about the code is unverified, and it has been
 * wrong before — the #9 audit found five false claims in the docs, including a
 * sample count out by four thousand and a directory that never existed. The CI
 * comment says as much: "a commit whose subject was correcting stale docs shipped
 * two new false claims."
 *
 * This suite holds the numbers in the docs to the same standard as the code, for
 * the counts most likely to go stale — the ones tied to a constant or produced by
 * the generation pipeline, named in HANDOFF.md as `DEFAULT_ARCHIVE_CAPACITY`,
 * `WEEKS_PLAYED`, and `SESSIONS`. The rule of the file: every expected phrase is
 * *computed* from the code (an exported constant, or a count derived by running
 * the real adapter → translation pipeline), never a second copy of the number. So
 * when a constant moves, the phrase this test looks for moves with it, and the
 * doc that still carries the old number is the thing that fails — which is exactly
 * the drift we want to be told about.
 *
 * What is deliberately not asserted: the machine-specific numbers in the
 * performance tables (milliseconds, megabytes, frame rates). Those are honest
 * measurements of one machine and are expected to vary; pinning them would make
 * this test lie about a different thing. Only structural counts live here.
 */

// A fixed clock, the same shape the translation tests use. The generators are
// pure in `now` and their seed, so the counts below are deterministic.
const NOW = Date.UTC(2025, 11, 8, 18, 0, 0);

function shape(nodes: Record<string, EcosystemNode>) {
  const all = Object.values(nodes);
  return {
    plants: all.filter((n) => n.kind === 'plant').length,
    beds: all.filter((n) => n.kind === 'bed').length,
  };
}

const nflSnapshot = generateNflSnapshot(NOW);
const nfl = shape(translateNflSnapshot(nflSnapshot).nodes);
const market = shape(translateMarketSnapshot(generateMarketSnapshot(NOW), { asOf: NOW }).nodes);
const world = shape(translateWorldSnapshot(generateWorldSnapshot(NOW), { asOf: NOW }).nodes);

// A market instrument prints one daily bar per session plus intraday bars on the
// most recent few sessions, so the count of distinct close-days for a single
// symbol *is* the session count (`SESSIONS`) — the "130 daily" the perf note
// cites — without reaching into a module-private constant to get it.
const marketBars = generateMarketSnapshot(NOW).bars;
const firstSymbol = marketBars[0]!.symbol;
const marketSessions = new Set(
  marketBars
    .filter((b) => b.symbol === firstSymbol)
    .map((b) => new Date(b.closeAt).toISOString().slice(0, 10)),
).size;

/**
 * A claim: a phrase the doc must contain, built from a value the code computes.
 * `\b` around a bare number keeps 140 from matching inside 1400; a trailing unit
 * word ("slots", "clubs") pins the number to the thing it counts, so an unrelated
 * 32 elsewhere in the file cannot satisfy a claim about clubs.
 */
interface Claim {
  /** What the number means, for the test name and the failure message. */
  readonly what: string;
  /** The doc that should carry it. */
  readonly file: string;
  readonly content: string;
  /** The value the code says is true. */
  readonly value: number;
  /** The phrase, as a regex built from `value`. */
  readonly phrase: (n: number) => RegExp;
}

// The archive holds whole weeks; the fine tier holds whole days. State it so a
// capacity that stops dividing evenly is caught here rather than silently
// rounded into a stale doc.
expect(DEFAULT_ARCHIVE_CAPACITY % 7).toBe(0);
expect(DEFAULT_CAPACITY % 24).toBe(0);
const archiveWeeks = DEFAULT_ARCHIVE_CAPACITY / 7;

const claims: Claim[] = [
  // History tiers — the sizes are the design decision, and the docs quote them.
  {
    what: 'archive tier capacity (DEFAULT_ARCHIVE_CAPACITY, daily slots)',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: DEFAULT_ARCHIVE_CAPACITY,
    phrase: (n) => new RegExp(`\\b${n}\\b\\s+slots`),
  },
  {
    what: 'archive reach in weeks (DEFAULT_ARCHIVE_CAPACITY / 7)',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: archiveWeeks,
    phrase: (n) => new RegExp(`\\b${n}\\s+weeks`),
  },
  {
    what: 'fine tier capacity (DEFAULT_CAPACITY, hourly slots)',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: DEFAULT_CAPACITY,
    phrase: (n) => new RegExp(`\\b${n}\\b\\s+slots`),
  },

  // Garden shape — counted by running the real pipeline, not read off a label.
  // The HANDOFF table writes these as digits, which is what these anchor to.
  {
    what: 'NFL division beds',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: nfl.beds,
    phrase: (n) => new RegExp(`\\b${n}\\s+divisions`),
  },
  {
    what: 'NFL club plants',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: nfl.plants,
    phrase: (n) => new RegExp(`\\b${n}\\s+clubs`),
  },
  {
    what: 'Market sector beds',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: market.beds,
    phrase: (n) => new RegExp(`\\b${n}\\s+sectors`),
  },
  {
    what: 'Market holding plants',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: market.plants,
    phrase: (n) => new RegExp(`\\b${n}\\s+holdings`),
  },
  {
    what: 'World subregion beds',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: world.beds,
    phrase: (n) => new RegExp(`\\b${n}\\s+UN subregions`),
  },
  {
    what: 'World state plants (HANDOFF table)',
    file: 'HANDOFF.md',
    content: HANDOFF,
    value: world.plants,
    phrase: (n) => new RegExp(`\\b${n}\\s+states`),
  },
  {
    what: 'World state plants (README)',
    file: 'README.md',
    content: README,
    value: world.plants,
    phrase: (n) => new RegExp(`\\b${n}\\s+UN member states`),
  },

  // Seeded-source spans — the drift-prone constants HANDOFF names by name.
  {
    what: 'NFL weeks played (WEEKS_PLAYED, snapshot.throughWeek)',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: nflSnapshot.throughWeek,
    phrase: (n) => new RegExp(`\\b${n}\\s+weeks played`),
  },
  {
    what: 'NFL games in a season',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: nflSnapshot.games.length,
    phrase: (n) => new RegExp(`\\b${n}\\s+games`),
  },
  {
    what: 'Market sessions (SESSIONS, distinct daily bars per symbol)',
    file: 'ARCHITECTURE.md',
    content: ARCHITECTURE,
    value: marketSessions,
    phrase: (n) => new RegExp(`\\b${n}\\s+daily`),
  },
];

describe('docs quote the counts the code actually produces', () => {
  it.each(claims)('$file states the $what as $value', ({ content, value, phrase, file, what }) => {
    const re = phrase(value);
    // A readable failure: say which doc, which number, and what the code says.
    expect(
      re.test(content),
      `${file} should state the ${what} as ${value} (matching ${re}), ` +
        `but no such phrase was found — the code and the doc have drifted apart.`,
    ).toBe(true);
  });
});
