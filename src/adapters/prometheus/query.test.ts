import { describe, expect, it, vi } from 'vitest';
import { fetchPromSnapshot, parseInstantVector } from './query';
import type { FetchLike } from './query';
import {
  ERROR_RESPONSE,
  LATENCY_RESPONSE,
  NONFINITE_RESPONSE,
  UP_RESPONSE,
} from './fixtures';
import type { PromApiResponse } from './types';

describe('parseInstantVector', () => {
  it('decodes the wire shape: string values become numbers, seconds become ms', () => {
    const samples = parseInstantVector(UP_RESPONSE);

    expect(samples).toHaveLength(3);
    expect(samples[0]).toEqual({
      labels: { __name__: 'up', instance: 'demo:9090', job: 'prometheus' },
      value: 1,
      at: 1_723_334_400_000, // seconds → ms, in one place only
    });
    expect(samples[2].value).toBe(0); // the down target, as a real 0
  });

  it('drops non-finite values rather than emitting a plant at NaN', () => {
    const samples = parseInstantVector(NONFINITE_RESPONSE);

    // Only the one finite series survives; +Inf and NaN are answers, not plants.
    expect(samples).toHaveLength(1);
    expect(samples[0].labels.instance).toBe('a:9100');
  });

  it('throws the server’s own message on an error envelope, not an empty garden', () => {
    expect(() => parseInstantVector(ERROR_RESPONSE)).toThrowError(/bad_data/);
    expect(() => parseInstantVector(ERROR_RESPONSE)).toThrowError(/parse error/);
  });

  it('refuses a matrix where a vector was expected', () => {
    const matrix: PromApiResponse = {
      status: 'success',
      data: { resultType: 'matrix', result: [] },
    };
    expect(() => parseInstantVector(matrix)).toThrowError(/instant vector/);
  });
});

describe('fetchPromSnapshot', () => {
  it('builds the query URL, sends the token, and returns a live-stamped snapshot', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      seen.push(url);
      expect(init?.headers?.Authorization).toBe('Bearer secret');
      const isUp = url.includes('query=up');
      return {
        ok: true,
        status: 200,
        json: async () => (isUp ? UP_RESPONSE : LATENCY_RESPONSE),
      };
    });

    const snapshot = await fetchPromSnapshot(
      {
        baseUrl: 'https://prom.example.com/',
        query: 'probe_duration_seconds',
        token: 'secret',
      },
      fetchImpl,
      1_723_334_400_000,
    );

    // The metric query and the up{} query, both under /api/v1/query, both encoded.
    expect(seen[0]).toBe(
      'https://prom.example.com/api/v1/query?query=probe_duration_seconds',
    );
    expect(seen[1]).toBe('https://prom.example.com/api/v1/query?query=up');
    expect(snapshot.series).toHaveLength(3);
    expect(snapshot.up).toHaveLength(3);
    expect(snapshot.provenance).toMatchObject({
      kind: 'live',
      endpoint: 'https://prom.example.com/',
      query: 'probe_duration_seconds',
    });
  });

  it('skips the up{} fetch when asked to', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => LATENCY_RESPONSE,
    }));

    const snapshot = await fetchPromSnapshot(
      { baseUrl: 'https://prom.example.com', query: 'probe_duration_seconds', includeUp: false },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshot.up).toBeUndefined();
  });

  it('surfaces a non-200 as an error rather than a silent empty result', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(
      fetchPromSnapshot(
        { baseUrl: 'https://prom.example.com', query: 'up', includeUp: false },
        fetchImpl,
      ),
    ).rejects.toThrowError(/503/);
  });
});
