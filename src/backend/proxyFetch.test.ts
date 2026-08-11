import { describe, expect, it } from 'vitest';
import { promProxyFetch, type ProxyTransport } from './proxyFetch';
import { fetchPromSnapshot } from '../adapters/prometheus/query';
import { handleProxyRequest } from './proxy';
import { promRegistry } from './registry';
import { PROM_MOCK_MAPPING, PROM_MOCK_QUERY, mockPromFetch } from '../adapters/prometheus/mock';

describe('promProxyFetch', () => {
  it('posts the sourceId and PromQL to the proxy, carrying no host or token', async () => {
    const sent: Array<{ url: string; body: unknown }> = [];
    const transport: ProxyTransport = async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [] } }) };
    };

    const fetchImpl = promProxyFetch('/api/proxy/prometheus', 'prometheus', transport);
    await fetchImpl('https://ignored.example/api/v1/query?query=up', {});

    expect(sent[0]?.url).toBe('/api/proxy/prometheus');
    expect(sent[0]?.body).toEqual({ sourceId: 'prometheus', promql: 'up' });
  });

  it('closes the loop: a proxy-backed client fetch drives fetchPromSnapshot end to end', async () => {
    // The transport routes the client POST straight into the server handler,
    // which fetches upstream through the mock — the whole hop, in one process.
    const registry = promRegistry([
      { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING },
    ]);
    const now = 2_000_000;
    const transport: ProxyTransport = async (_url, init) => {
      const { sourceId, promql } = JSON.parse(init.body);
      const result = await handleProxyRequest(registry, mockPromFetch(() => now), { sourceId, promql });
      if (!result.ok) return { ok: false, status: result.status, json: async () => ({ error: result.error }) };
      return { ok: true, status: result.status, json: async () => result.body };
    };

    const fetchImpl = promProxyFetch('/api/proxy/prometheus', 'prometheus', transport);
    const snapshot = await fetchPromSnapshot(PROM_MOCK_QUERY, fetchImpl, now);

    expect(snapshot.series.length).toBeGreaterThan(0);
    expect(snapshot.up?.length).toBeGreaterThan(0);
    // The snapshot fetchPromSnapshot builds is stamped live — the tripwire the
    // live test also checks, preserved across the proxy hop.
    expect(snapshot.provenance.kind).toBe('live');
  });
});
