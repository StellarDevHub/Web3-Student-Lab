/**
 * Integration tests for IpfsGatewayService — Issue #1178
 *
 * Verifies:
 *  - Multi-gateway fallback (primary gateway failure → secondary succeeds).
 *  - SHA-256 content-integrity checks on every fetched payload.
 *  - Integrity error thrown when content does not match expected digest.
 *  - Gateway health counters updated correctly.
 *  - In-process caching honours TTL.
 *  - URI parsing for ipfs://, https://…/ipfs/… and bare CIDs.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import {
  IpfsGatewayService,
  IpfsGatewayConfig,
  IpfsFetchResult,
} from '../src/services/ipfs.gateway.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Creates a mock fetch function that returns a fixed payload for every call. */
function mockFetchSuccess(body: Buffer): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }) as jest.Mock;
}

/** Creates a mock fetch that fails (network error) on every call. */
function mockFetchNetworkError(): jest.Mock {
  return jest.fn().mockRejectedValue(new Error('network unreachable')) as jest.Mock;
}

/** Creates a mock fetch that returns HTTP 500. */
function mockFetchHttp500(): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }) as jest.Mock;
}

const TEST_CID = 'bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354';
const TEST_CONTENT = Buffer.from(JSON.stringify({ name: 'Web3 Certificate', description: 'Test' }));
const TEST_SHA256 = sha256Hex(TEST_CONTENT);

const SINGLE_GATEWAY: IpfsGatewayConfig[] = [
  { name: 'TestGateway', urlTemplate: 'https://test.example.com/ipfs/{cid}{path}', timeoutMs: 5_000 },
];

const TWO_GATEWAYS: IpfsGatewayConfig[] = [
  { name: 'Primary', urlTemplate: 'https://primary.example.com/ipfs/{cid}{path}', timeoutMs: 5_000 },
  { name: 'Secondary', urlTemplate: 'https://secondary.example.com/ipfs/{cid}{path}', timeoutMs: 5_000 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IpfsGatewayService', () => {
  // ── Basic Fetch & SHA-256 Integrity ────────────────────────────────────

  describe('fetchByCid — basic', () => {
    it('returns content with correct SHA-256 digest', async () => {
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetchSuccess(TEST_CONTENT) as typeof fetch,
      });

      const result: IpfsFetchResult = await service.fetchByCid(TEST_CID);

      expect(result.content).toEqual(TEST_CONTENT);
      expect(result.sha256).toBe(TEST_SHA256);
      expect(result.gateway).toBe('TestGateway');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('includes the resolved URL in the result', async () => {
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetchSuccess(TEST_CONTENT) as typeof fetch,
      });

      const result = await service.fetchByCid(TEST_CID);

      expect(result.url).toContain(TEST_CID);
      expect(result.url).toContain('test.example.com');
    });
  });

  // ── Content-Integrity (SHA-256) Verification ───────────────────────────

  describe('content-integrity — SHA-256 enforcement', () => {
    it('resolves when fetched content matches the expected digest', async () => {
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetchSuccess(TEST_CONTENT) as typeof fetch,
      });

      await expect(service.fetchByCid(TEST_CID, '', TEST_SHA256)).resolves.toMatchObject({
        sha256: TEST_SHA256,
      });
    });

    it('throws when the fetched content does NOT match the expected SHA-256', async () => {
      const tamperedContent = Buffer.from('tampered content here');
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetchSuccess(tamperedContent) as typeof fetch,
        maxAttempts: 1,
      });

      await expect(service.fetchByCid(TEST_CID, '', TEST_SHA256)).rejects.toThrow(
        /All IPFS gateways failed/
      );
    });

    it('throws AggregateError when all gateways return a content-integrity mismatch', async () => {
      const badContent = Buffer.from('wrong data');
      const service = new IpfsGatewayService({
        gateways: TWO_GATEWAYS,
        fetchFn: mockFetchSuccess(badContent) as typeof fetch,
        maxAttempts: 2,
      });

      await expect(service.fetchByCid(TEST_CID, '', TEST_SHA256)).rejects.toThrow(
        AggregateError
      );
    });

    it('computeSha256 produces correct hex digest', () => {
      const service = new IpfsGatewayService({ gateways: SINGLE_GATEWAY });
      const input = Buffer.from('hello world');
      const expected = crypto.createHash('sha256').update(input).digest('hex');
      expect(service.computeSha256(input)).toBe(expected);
    });

    it('two distinct buffers produce distinct SHA-256 digests', () => {
      const service = new IpfsGatewayService({ gateways: SINGLE_GATEWAY });
      const a = service.computeSha256(Buffer.from('aaa'));
      const b = service.computeSha256(Buffer.from('bbb'));
      expect(a).not.toBe(b);
    });

    it('empty buffer has a deterministic SHA-256', () => {
      const service = new IpfsGatewayService({ gateways: SINGLE_GATEWAY });
      const digest = service.computeSha256(Buffer.alloc(0));
      // SHA-256 of empty string is well-known
      expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  // ── Multi-Gateway Fallback ──────────────────────────────────────────────

  describe('multi-gateway fallback', () => {
    it('falls back to the secondary gateway when the primary fails', async () => {
      let callCount = 0;
      const fetchFn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('primary down');
        }
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => {
            const buf = TEST_CONTENT;
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        };
      }) as jest.Mock;

      const service = new IpfsGatewayService({
        gateways: TWO_GATEWAYS,
        fetchFn: fetchFn as typeof fetch,
        maxAttempts: 2,
      });

      const result = await service.fetchByCid(TEST_CID);

      expect(result.gateway).toBe('Secondary');
      expect(callCount).toBe(2);
    });

    it('throws AggregateError when all gateways fail', async () => {
      const service = new IpfsGatewayService({
        gateways: TWO_GATEWAYS,
        fetchFn: mockFetchNetworkError() as typeof fetch,
        maxAttempts: 2,
      });

      await expect(service.fetchByCid(TEST_CID)).rejects.toThrow(AggregateError);
    });

    it('throws AggregateError on HTTP 5xx from all gateways', async () => {
      const service = new IpfsGatewayService({
        gateways: TWO_GATEWAYS,
        fetchFn: mockFetchHttp500() as typeof fetch,
        maxAttempts: 2,
      });

      await expect(service.fetchByCid(TEST_CID)).rejects.toThrow(AggregateError);
    });
  });

  // ── Gateway Health Tracking ────────────────────────────────────────────

  describe('gateway health tracking', () => {
    it('increments consecutiveErrors on gateway failure', async () => {
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetchNetworkError() as typeof fetch,
        maxAttempts: 1,
      });

      await service.fetchByCid(TEST_CID).catch(() => {/* expected */});

      const [health] = service.getHealthStatus();
      expect(health?.consecutiveErrors).toBeGreaterThan(0);
      expect(health?.totalErrors).toBeGreaterThan(0);
      expect(health?.lastErrorAt).toBeInstanceOf(Date);
    });

    it('resets consecutiveErrors to 0 on success', async () => {
      let attempt = 0;
      const fetchFn = jest.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error('first fail');
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => {
            const buf = TEST_CONTENT;
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        };
      }) as jest.Mock;

      const service = new IpfsGatewayService({
        gateways: [...SINGLE_GATEWAY, ...SINGLE_GATEWAY.map(g => ({ ...g, name: 'Fallback' }))],
        fetchFn: fetchFn as typeof fetch,
        maxAttempts: 2,
      });

      await service.fetchByCid(TEST_CID);

      const health = service.getHealthStatus().find(h => h.name === 'Fallback');
      expect(health?.consecutiveErrors).toBe(0);
      expect(health?.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('getHealthStatus returns all configured gateways', () => {
      const service = new IpfsGatewayService({ gateways: TWO_GATEWAYS });
      const statuses = service.getHealthStatus();
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.name)).toEqual(
        expect.arrayContaining(['Primary', 'Secondary'])
      );
    });
  });

  // ── URI Parsing ────────────────────────────────────────────────────────

  describe('fetchByUri — URI parsing', () => {
    it('handles ipfs:// URI', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      const result = await service.fetchByUri(`ipfs://${TEST_CID}`);
      expect(result.content).toEqual(TEST_CONTENT);
    });

    it('handles ipfs:// URI with sub-path', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      const result = await service.fetchByUri(`ipfs://${TEST_CID}/metadata.json`);
      expect(result.url).toContain('/metadata.json');
    });

    it('handles https://gateway/ipfs/CID URI', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      const result = await service.fetchByUri(
        `https://cloudflare-ipfs.com/ipfs/${TEST_CID}`
      );
      expect(result.content).toEqual(TEST_CONTENT);
    });

    it('handles bare CID string', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      const result = await service.fetchByUri(TEST_CID);
      expect(result.content).toEqual(TEST_CONTENT);
    });
  });

  // ── Caching ────────────────────────────────────────────────────────────

  describe('in-process cache', () => {
    it('serves subsequent requests from cache without additional fetch calls', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
        cacheCapacity: 10,
        cacheTtlMs: 60_000,
      });

      await service.fetchByCid(TEST_CID);
      await service.fetchByCid(TEST_CID);
      await service.fetchByCid(TEST_CID);

      // fetch should only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after cache is cleared', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      await service.fetchByCid(TEST_CID);
      service.clearCache();
      await service.fetchByCid(TEST_CID);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws integrity error for cached result when expected digest does not match', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: SINGLE_GATEWAY,
        fetchFn: mockFetch as typeof fetch,
      });

      // Prime the cache
      await service.fetchByCid(TEST_CID);

      // Verify with a wrong digest — should throw even for the cached entry
      await expect(
        service.fetchByCid(TEST_CID, '', 'wrongdigest0000000000000000000000000000000000000000000000000000000')
      ).rejects.toThrow(/content-integrity failure/);
    });
  });

  // ── buildPublicUrl ─────────────────────────────────────────────────────

  describe('buildPublicUrl', () => {
    it('returns a well-formed HTTPS URL for the given CID', () => {
      const service = new IpfsGatewayService({ gateways: SINGLE_GATEWAY });
      const url = service.buildPublicUrl(TEST_CID);
      expect(url).toContain(TEST_CID);
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  // ── Disabled Gateways ──────────────────────────────────────────────────

  describe('disabled gateways', () => {
    it('skips gateways with enabled=false', async () => {
      const mockFetch = mockFetchSuccess(TEST_CONTENT);
      const service = new IpfsGatewayService({
        gateways: [
          { name: 'Disabled', urlTemplate: 'https://disabled.example.com/ipfs/{cid}{path}', enabled: false },
          SINGLE_GATEWAY[0]!,
        ],
        fetchFn: mockFetch as typeof fetch,
      });

      const result = await service.fetchByCid(TEST_CID);
      expect(result.gateway).toBe('TestGateway');
    });
  });
});
