import { getStore } from '@netlify/blobs';
import { STORAGE_KEY, type CollectorStorage } from '../../src/state/collector';

/**
 * The persistent `CollectorStorage`, over Netlify Blobs — the one place a
 * runtime leaks into the backend.
 *
 * `CollectorStorage` is synchronous (the browser's `localStorage` is), and Blobs
 * is async, so the two cannot be the same object. The bridge is once on each side
 * of a tick: read the record out of Blobs into a synchronous in-memory cell the
 * collector drives, run the tick, then push whatever it left in the cell back to
 * Blobs. A serverless filesystem does not persist between invocations, which is
 * why this is Blobs and not the six-line file adapter `docs/backend.md` shows.
 *
 * The blob key is the record's own `STORAGE_KEY`, so the format on the wire is
 * byte-identical to what the browser writes to `localStorage` — the whole point
 * of `ObservedRecord` being the shared format.
 */
const BLOB_STORE = 'spatialui';

export interface RecordCell {
  /** The synchronous storage the collector reads and writes during a tick. */
  storage: CollectorStorage;
  /** Push whatever the tick left in the cell back to Blobs. Call after `flush`. */
  persist(): Promise<void>;
}

export async function loadRecordCell(): Promise<RecordCell> {
  const store = getStore(BLOB_STORE);
  const existing = await store.get(STORAGE_KEY, { type: 'text' });

  const cell = new Map<string, string>();
  if (existing) cell.set(STORAGE_KEY, existing);

  const storage: CollectorStorage = {
    getItem: (key) => cell.get(key) ?? null,
    setItem: (key, value) => void cell.set(key, value),
    removeItem: (key) => void cell.delete(key),
  };

  const persist = async (): Promise<void> => {
    const value = cell.get(STORAGE_KEY);
    if (value) await store.set(STORAGE_KEY, value);
    else await store.delete(STORAGE_KEY);
  };

  return { storage, persist };
}
