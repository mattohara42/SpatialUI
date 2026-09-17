/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The backend proxy endpoint for the Prometheus source. Unset in dev and in
   * tests, which keeps the source on the in-process mock; set in a networked
   * deploy to take it live through the proxy (see `state/sources.ts`).
   */
  readonly VITE_PROM_PROXY_URL?: string;
  /**
   * The backend proxy endpoint for the NFL source. Unset in dev and in tests,
   * which keeps the seeded season; set to `/api/proxy/nfl` in a networked deploy
   * to take the league live against ESPN (see `docs/running-live.md`).
   */
  readonly VITE_NFL_PROXY_URL?: string;
  /**
   * `'false'` drops the five hand-written mock gardens and keeps only the ones
   * that come through an adapter and a translator. Anything else, including
   * unset, keeps them — so dev and tests are unaffected.
   */
  readonly VITE_MOCK_GARDENS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
