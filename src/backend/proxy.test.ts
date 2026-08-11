import { describe, expect, it, vi } from 'vitest';
import { handleProxyRequest } from './proxy';
import { promRegistry } from './registry';
import { PROM_MOCK_MAPPING, PROM_MOCK_QUERY, mockPromFetch } from '../adapters/prometheus/mock';
import type { FetchLike } from '../adapters/prometheus/query';

const registry = promRegistry([
  { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING },
]);

describe('handleProxyRequest', () => {
  it('forwards a permitted query and returns the wire envelope untouched', async () => {
    const result = await handleProxyRequest(registry, mockPromFetch(), {
      sourceId: 'prometheus',
      promql: PROM_MOCK_QUERY.query,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    // The envelope is passed through, not re-parsed.
    expect((result.body as { status: string }).status).toBe('success');
  });

  it('permits the up query, since the source is asked for its own liveness', async () => {
    const result = await handleProxyRequest(registry, mockPromFetch(), {
      sourceId: 'prometheus',
      promql: 'up',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses an unknown source with 404 — the allowlist is the boundary', async () => {
    const result = await handleProxyRequest(registry, mockPromFetch(), {
      sourceId: 'not-registered',
      promql: 'up',
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('refuses an arbitrary PromQL with 403 — no query injection past the allowlist', async () => {
    const result = await handleProxyRequest(registry, mockPromFetch(), {
      sourceId: 'prometheus',
      promql: 'node_cpu_seconds_total{mode="idle"}',
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses an empty PromQL with 400', async () => {
    const result = await handleProxyRequest(registry, mockPromFetch(), {
      sourceId: 'prometheus',
      promql: '',
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('attaches the bearer token server-side and never asks the client for it', async () => {
    const seen: Array<{ url: string; headers?: Record<string, string> }> = [];
    const capturing: FetchLike = async (url, init) => {
      seen.push({ url, headers: init?.headers });
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [] } }) };
    };
    const tokened = promRegistry([
      {
        id: 'secure',
        query: { ...PROM_MOCK_QUERY, token: 's3cret' },
        mapping: PROM_MOCK_MAPPING,
      },
    ]);

    await handleProxyRequest(tokened, capturing, { sourceId: 'secure', promql: 'up' });

    expect(seen[0]?.headers?.Authorization).toBe('Bearer s3cret');
  });

  it('turns an upstream throw into a 502 rather than propagating it', async () => {
    const failing: FetchLike = () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await handleProxyRequest(registry, failing, {
      sourceId: 'prometheus',
      promql: 'up',
    });
    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) expect(result.error).toContain('ECONNREFUSED');
  });

  it('passes an upstream non-200 through with its status', async () => {
    const forbidden: FetchLike = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ status: 'error', error: 'forbidden' }),
    });
    const result = await handleProxyRequest(registry, forbidden, {
      sourceId: 'prometheus',
      promql: 'up',
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('builds the query URL against the registered host, not anything the client sent', async () => {
    const capture = vi.fn<FetchLike>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { resultType: 'vector', result: [] } }),
    }));
    await handleProxyRequest(registry, capture, { sourceId: 'prometheus', promql: 'up' });
    expect(capture.mock.calls[0]?.[0]).toBe(
      `${PROM_MOCK_QUERY.baseUrl}/api/v1/query?query=up`,
    );
  });
});
