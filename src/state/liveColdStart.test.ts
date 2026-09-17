import { describe, expect, it } from 'vitest';
import { dueAt, dueSources } from './sources';
import { liveNflSource } from '../adapters/nfl';
import { NFL_GARDEN_ID } from '../translation/nfl';

/**
 * The cold-start deadlock, as a reproduction.
 *
 * A live source populates its garden only from `refresh`, and `refresh` is only
 * ever called by the store's `poll`, which asks `dueSources` who is owed a
 * reading. `dueAt` answers that question from the freshest *plant already in the
 * garden* — so a garden with no plants yet returns `null`, meaning "nothing
 * owed", and the source is never polled.
 *
 * That closes the loop: no nodes means never due, never due means no refresh, no
 * refresh means no nodes. A live NFL garden on a fresh load can never populate
 * itself, and the symptom is not a slow or stale garden but a missing one — the
 * garden button is built by filtering nodes for `kind === 'garden'`, so an empty
 * read removes the tab entirely.
 */
describe('a live source that has never spoken', () => {
  it('translates to nothing before its first refresh', () => {
    const source = liveNflSource({ fetchImpl: async () => new Response('{}') });
    expect(source.snapshot).toBeNull();
    expect(Object.keys(source.read(Date.now()).nodes)).toHaveLength(0);
  });

  it('is never due, because being due is computed from the plants it has none of', () => {
    const now = Date.now();
    expect(dueAt({}, NFL_GARDEN_ID, 1000)).toBeNull();
    // Even a zero policy does not make it due: `null` is not "overdue", it is
    // "no opinion", and `dueSources` reads it as nothing owed.
    expect(dueAt({}, NFL_GARDEN_ID, 0)).toBeNull();
    expect(now).toBeGreaterThan(0);
  });

  it('is polled, because a feed that fetches and has said nothing is owed a reading', () => {
    const source = liveNflSource({ fetchImpl: async () => new Response('{}') });
    const live = {
      gardenId: NFL_GARDEN_ID,
      policy: 1000,
      pollable: true,
      read: source.read,
      refresh: source.refresh,
    };
    // This is the assertion that was false before the fix, and it is the whole
    // of the bug: an empty live garden has to be polled or it stays empty.
    expect(dueSources({}, Date.now(), [live])).toHaveLength(1);
  });

  it('stops being owed once it has answered and its policy is satisfied', () => {
    const now = Date.now();
    const live = {
      gardenId: NFL_GARDEN_ID,
      policy: 1000,
      pollable: true,
      read: () => ({ nodes: {}, edges: {}, history: {}, archive: {} }),
      refresh: async () => {},
    };
    const populated = {
      plant: {
        id: 'plant',
        kind: 'plant' as const,
        gardenId: NFL_GARDEN_ID,
        updatedAt: now,
      },
    } as unknown as Parameters<typeof dueSources>[0];
    // Fresh plant, policy not yet elapsed: nothing owed.
    expect(dueSources(populated, now, [live])).toHaveLength(0);
    // Policy elapsed: owed again, by the ordinary path.
    expect(dueSources(populated, now + 2000, [live])).toHaveLength(1);
  });

  // The narrowing that keeps the fix from changing the generated sources, which
  // answer synchronously from `read` and are never empty in the first place.
  it('does not poll a source with no refresh just because its garden is empty', () => {
    const generated = {
      gardenId: 'somewhere',
      policy: 1000,
      pollable: true,
      read: () => ({ nodes: {}, edges: {}, history: {}, archive: {} }),
    };
    expect(dueSources({}, Date.now(), [generated])).toHaveLength(0);
  });
});
