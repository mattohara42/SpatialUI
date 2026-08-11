/**
 * The backend's public face — the runtime-agnostic core of the fetch proxy and
 * the unattended collector loop.
 *
 * Everything here is pure and green offline: the proxy takes an injected fetch,
 * the loop takes an injected fetch and storage, and the record format is the one
 * the client already writes. Only two thin shells are left to a real runtime and
 * a deploy target — an HTTP route around `handleProxyRequest`, and a persistent
 * `CollectorStorage` (a file or a KV row) in place of `memoryStorage`. Neither
 * needs egress to build, which is why this whole layer is testable in an
 * environment that has none. See `docs/backend.md`.
 */

export { promRegistry, type PromRegistry, type RegisteredPromSource } from './registry';
export { handleProxyRequest, type ProxyRequest, type ProxyResult } from './proxy';
export { promProxyFetch, type ProxyTransport } from './proxyFetch';
export { memoryStorage } from './storage';
export {
  createCollectorLoop,
  sourcesFromRegistry,
  type CollectorLoop,
  type CollectorLoopOptions,
} from './collectorLoop';
