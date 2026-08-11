import { describe, expect, it } from 'vitest';
import type { CollectorStorage } from './collector';
import type { DeclarativeMapping } from '../translation/declarative';
import {
  USER_GARDENS_KEY,
  DEFAULT_USER_STALE_MS,
  loadUserConfigs,
  previewMapping,
  saveUserConfigs,
  upsertConfig,
  userGardenId,
  userSourceFromConfig,
  type UserGardenConfig,
} from './userSources';

/** A Map-backed storage, since the tests run in node where there is no localStorage. */
function memoryStorage(): CollectorStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const PAYLOAD = {
  teams: [
    { name: 'North Rovers', group: 'A', points: 21, form: 0.8 },
    { name: 'East United', group: 'A', points: 12, form: 0.4 },
    { name: 'South City', group: 'B', points: 27, form: 0.9 },
    { name: 'West Albion', group: 'B', points: 6, form: 0.2 },
  ],
};

function leagueMapping(overrides: Partial<DeclarativeMapping> = {}): DeclarativeMapping {
  return {
    gardenId: 'user/league',
    gardenLabel: 'League',
    recordsPath: 'teams',
    labelPath: 'name',
    levelPath: 'points',
    vitality: { min: 0, max: 30 },
    polarity: 'nurture',
    bedPath: 'group',
    activity: { path: 'form', scale: { min: 0, max: 1 } },
    ...overrides,
  };
}

function configOf(mapping: DeclarativeMapping, payload: unknown = PAYLOAD): UserGardenConfig {
  return { mapping, payload, createdAt: 1, updatedAt: 1 };
}

describe('userGardenId', () => {
  it('namespaces under user/ and slugs the name', () => {
    expect(userGardenId('My League!')).toBe('user/my-league');
    expect(userGardenId('  Spaces   Here ')).toBe('user/spaces-here');
  });

  it('never collides with a built-in id, even from an empty name', () => {
    expect(userGardenId('')).toBe('user/garden');
    expect(userGardenId('nfl').startsWith('user/')).toBe(true);
  });
});

describe('userSourceFromConfig', () => {
  it('reads the pasted payload into a translated garden', () => {
    const source = userSourceFromConfig(configOf(leagueMapping()));
    const garden = source.read(1000);
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    expect(plants).toHaveLength(4);
    // vitality is a comparison under the stated scale: 27/30 reads high, 6/30 low.
    const south = plants.find((p) => p.label === 'South City')!;
    const west = plants.find((p) => p.label === 'West Albion')!;
    expect(south.vitality).toBeGreaterThan(west.vitality);
  });

  it('is a static snapshot: not pollable, no refresh', () => {
    const source = userSourceFromConfig(configOf(leagueMapping()));
    expect(source.pollable).toBe(false);
    expect(source.refresh).toBeUndefined();
  });

  it('defaults its stale policy when none is configured', () => {
    expect(userSourceFromConfig(configOf(leagueMapping())).policy).toBe(DEFAULT_USER_STALE_MS);
    const withPolicy = { ...configOf(leagueMapping()), staleAfterMs: 12345 };
    expect(userSourceFromConfig(withPolicy).policy).toBe(12345);
  });
});

describe('previewMapping', () => {
  it('runs the real interpreter and summarizes beds, plants, and axes', () => {
    const result = previewMapping(PAYLOAD, leagueMapping(), 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.plants).toBe(4);
    expect(result.summary.beds).toBe(2);
    expect(result.summary.axes.vitality.spread).toBeGreaterThan(0);
    expect(result.summary.saturated).toHaveLength(0);
  });

  it('surfaces the interpreter error verbatim rather than throwing', () => {
    // A level path that is not on the records: the interpreter names the path.
    const result = previewMapping(PAYLOAD, leagueMapping({ levelPath: 'nope' }), 1000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("'nope'");
  });

  it('flags a data-driven axis that is flat across the garden', () => {
    // Every team on the same points: vitality is identical everywhere, which is a
    // saturated channel — it looks like a signal that is always on.
    const flat = {
      teams: PAYLOAD.teams.map((t) => ({ ...t, points: 15 })),
    };
    const result = previewMapping(flat, leagueMapping(), 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.saturated).toContain('vitality');
  });

  it('never flags maturity, which is a constant by design, not a dead signal', () => {
    // Maturity is the same for every plant here (no per-node age in the data), but
    // that is expected, not a saturated channel — warning on it would be noise.
    const result = previewMapping(PAYLOAD, leagueMapping(), 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.axes.maturity.spread).toBe(0);
    expect(result.summary.saturated).not.toContain('maturity');
  });

  it('does not flag activity as flat when the mapping never drove it', () => {
    const result = previewMapping(PAYLOAD, leagueMapping({ activity: undefined }), 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Unmapped activity sits at a constant 0.5; that is not a saturated signal.
    expect(result.summary.saturated).not.toContain('activity');
  });
});

describe('persistence', () => {
  it('round-trips configs through storage under its own key', () => {
    const storage = memoryStorage();
    const config = configOf(leagueMapping());
    saveUserConfigs([config], storage);
    expect(storage.map.has(USER_GARDENS_KEY)).toBe(true);
    expect(loadUserConfigs(storage)).toEqual([config]);
  });

  it('returns nothing for empty or corrupt storage rather than throwing', () => {
    const storage = memoryStorage();
    expect(loadUserConfigs(storage)).toEqual([]);
    storage.setItem(USER_GARDENS_KEY, '{ not json');
    expect(loadUserConfigs(storage)).toEqual([]);
  });

  it('drops entries that are not our shape', () => {
    const storage = memoryStorage();
    const good = configOf(leagueMapping());
    storage.setItem(
      USER_GARDENS_KEY,
      JSON.stringify([good, { mapping: { gardenId: 'x' } }, 42, null]),
    );
    expect(loadUserConfigs(storage)).toEqual([good]);
  });
});

describe('upsertConfig', () => {
  it('replaces a config with the same garden id and appends a new one', () => {
    const a = configOf(leagueMapping());
    const b = configOf(leagueMapping({ gardenId: 'user/other' }));
    const edited = { ...a, updatedAt: 999 };

    const afterAdd = upsertConfig([a], b);
    expect(afterAdd).toHaveLength(2);

    const afterEdit = upsertConfig(afterAdd, edited);
    expect(afterEdit).toHaveLength(2);
    expect(afterEdit.find((c) => c.mapping.gardenId === 'user/league')!.updatedAt).toBe(999);
  });
});
