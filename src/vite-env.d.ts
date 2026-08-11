/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The backend proxy endpoint for the Prometheus source. Unset in dev and in
   * tests, which keeps the source on the in-process mock; set in a networked
   * deploy to take it live through the proxy (see `state/sources.ts`).
   */
  readonly VITE_PROM_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
