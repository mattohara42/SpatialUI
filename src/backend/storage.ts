import type { CollectorStorage } from '../state/collector';

/**
 * An in-memory `CollectorStorage` — the reference implementation, and the one
 * the tests drive.
 *
 * `CollectorStorage` is the seam that already made the collector runtime-agnostic:
 * three synchronous methods (`getItem`/`setItem`/`removeItem`), which `localStorage`
 * satisfies in the browser and this satisfies in a test or a headless run. A
 * *persistent* server adapter is the same three methods over a file or a KV row,
 * and it is the one part of the backend that is deliberately left to the runtime
 * — because a file read is `fs`, which this repo does not type, and the record's
 * format (`state/persist.ts`) is fixed regardless of where the bytes land. The
 * file/KV adapter is a six-line drop-in; see `docs/backend.md`.
 */
export function memoryStorage(initial?: Record<string, string>): CollectorStorage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
