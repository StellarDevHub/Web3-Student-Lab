import { describe, it, expect } from 'vitest';

import {
  buildCarArchive,
  chunkAndDedupe,
  cidForBlock,
  decryptChunk,
  DEFAULT_CHUNK_SIZE,
  encryptChunk,
  generateArchiveKey,
  parseCarArchive,
  pinWithFallback,
  type ArchiveFile,
  type PinGateway,
} from '@/lib/storage/ipfs';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('cidForBlock', () => {
  it('produces a base32, "b"-prefixed CIDv1 string', async () => {
    const cid = await cidForBlock(bytesOf('hello world'));
    expect(cid.toString()).toMatch(/^b[a-z2-7]+$/);
  });

  it('is deterministic for identical content', async () => {
    const a = await cidForBlock(bytesOf('same content'));
    const b = await cidForBlock(bytesOf('same content'));
    expect(a.toString()).toBe(b.toString());
  });

  it('differs for different content', async () => {
    const a = await cidForBlock(bytesOf('content A'));
    const b = await cidForBlock(bytesOf('content B'));
    expect(a.toString()).not.toBe(b.toString());
  });
});

describe('chunkAndDedupe', () => {
  it('splits a buffer into fixed-size chunks', async () => {
    const data = new Uint8Array(DEFAULT_CHUNK_SIZE * 2 + 10);
    const { chunks, order } = await chunkAndDedupe(data);
    expect(order).toHaveLength(3);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('deduplicates identical chunks', async () => {
    // Two identical chunk-sized blocks of zeros dedupe to one stored chunk.
    const data = new Uint8Array(DEFAULT_CHUNK_SIZE * 2);
    const { chunks, dedupedBytes } = await chunkAndDedupe(data);
    expect(chunks).toHaveLength(1);
    expect(dedupedBytes).toBe(DEFAULT_CHUNK_SIZE);
  });

  it('handles an empty file by producing one empty chunk', async () => {
    const { chunks, order } = await chunkAndDedupe(new Uint8Array(0));
    expect(chunks).toHaveLength(1);
    expect(order).toHaveLength(1);
  });
});

describe('AES-GCM chunk encryption', () => {
  it('round-trips plaintext through encrypt/decrypt', async () => {
    const key = await generateArchiveKey();
    const plaintext = bytesOf('certificate metadata payload');
    const ciphertext = await encryptChunk(key, plaintext, 0);
    expect(ciphertext).not.toEqual(plaintext);

    const decrypted = await decryptChunk(key, ciphertext, 0);
    expect(new TextDecoder().decode(decrypted)).toBe('certificate metadata payload');
  });

  it('fails to decrypt with the wrong counter (IV)', async () => {
    const key = await generateArchiveKey();
    const ciphertext = await encryptChunk(key, bytesOf('secret'), 0);
    await expect(decryptChunk(key, ciphertext, 1)).rejects.toThrow();
  });
});

describe('buildCarArchive', () => {
  it('builds a valid CARv1 stream that parses back to the same block count', async () => {
    const files: ArchiveFile[] = [
      { name: 'certificate.png', data: bytesOf('fake-png-bytes'), mimeType: 'image/png' },
      { name: 'metadata.json', data: bytesOf('{"course":"Soroban 101"}'), mimeType: 'application/json' },
    ];

    const result = await buildCarArchive(files);
    expect(result.rootCid).toMatch(/^b[a-z2-7]+$/);
    expect(result.manifest).toHaveLength(2);
    expect(result.encrypted).toBe(false);

    const parsed = parseCarArchive(result.bytes);
    expect(parsed.blocks.length).toBe(result.totalBlocks);
  });

  it('encrypts chunks when a key is supplied, and still produces a valid archive', async () => {
    const key = await generateArchiveKey();
    const files: ArchiveFile[] = [{ name: 'secret.txt', data: bytesOf('do not leak this') }];

    const result = await buildCarArchive(files, { encryptionKey: key });
    expect(result.encrypted).toBe(true);

    // The manifest is stored as plaintext JSON (it holds only names/sizes/CIDs),
    // but the actual file bytes are not present anywhere in the raw archive.
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(result.bytes);
    expect(raw).not.toContain('do not leak this');
  });

  it('deduplicates an identical file referenced twice', async () => {
    const payload = bytesOf('duplicate-cert-image-bytes');
    const files: ArchiveFile[] = [
      { name: 'a.png', data: payload },
      { name: 'b.png', data: payload },
    ];

    const result = await buildCarArchive(files);
    // Both files share one underlying chunk plus one manifest block.
    expect(result.totalBlocks).toBe(2);
    expect(result.manifest[0].rootCid).toBe(result.manifest[1].rootCid);
  });
});

describe('pinWithFallback', () => {
  it('falls back to the next gateway when the first fails', async () => {
    const gateways: PinGateway[] = [
      { name: 'flaky', uploadUrl: 'https://flaky.example/car' },
      { name: 'reliable', uploadUrl: 'https://reliable.example/car' },
    ];

    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call === 1) throw new Error('connection refused');
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await pinWithFallback(new Uint8Array([1, 2, 3]), gateways, fetchImpl);

    expect(result.pinnedBy).toBe('reliable');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].ok).toBe(false);
    expect(result.attempts[1].ok).toBe(true);
  });

  it('reports every attempt failed when all gateways reject', async () => {
    const gateways: PinGateway[] = [{ name: 'down', uploadUrl: 'https://down.example/car' }];
    const fetchImpl = (async () => new Response(null, { status: 503 })) as typeof fetch;

    const result = await pinWithFallback(new Uint8Array([1]), gateways, fetchImpl);

    expect(result.pinnedBy).toBeNull();
    expect(result.attempts[0]).toMatchObject({ gateway: 'down', ok: false, error: 'HTTP 503' });
  });

  it('sends the backend gateway a JSON body with base64 content, matching StoragePinRequest', async () => {
    const gateways: PinGateway[] = [
      { name: 'app backend (Pinata)', uploadUrl: 'https://api.example/storage/pin-file', mode: 'backend-json' },
    ];

    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url, init) => {
      capturedInit = init;
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const result = await pinWithFallback(new Uint8Array([1, 2, 3]), gateways, fetchImpl, {
      resourceType: 'certificate-archive',
      resourceId: 'cert-42',
      name: 'archive.car',
    });

    expect(result.pinnedBy).toBe('app backend (Pinata)');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toMatchObject({
      resourceType: 'certificate-archive',
      resourceId: 'cert-42',
      name: 'archive.car',
      mimeType: 'application/vnd.ipld.car',
    });
    expect(typeof body.contentBase64).toBe('string');
    expect(Buffer.from(body.contentBase64, 'base64')).toEqual(Buffer.from([1, 2, 3]));
  });

  it('falls back from the backend gateway to a raw gateway on failure', async () => {
    const gateways: PinGateway[] = [
      { name: 'app backend (Pinata)', uploadUrl: 'https://api.example/storage/pin-file', mode: 'backend-json' },
      { name: 'local IPFS node', uploadUrl: 'http://127.0.0.1:5001/api/v0/dag/import', mode: 'raw' },
    ];

    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call === 1) throw new Error('backend unreachable');
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await pinWithFallback(new Uint8Array([9]), gateways, fetchImpl);

    expect(result.pinnedBy).toBe('local IPFS node');
    expect(result.attempts[0]).toMatchObject({ gateway: 'app backend (Pinata)', ok: false });
  });
});
