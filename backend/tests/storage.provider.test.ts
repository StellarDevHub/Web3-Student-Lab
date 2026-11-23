import { describe, expect, it } from '@jest/globals';
import { MockStorageProvider } from '../src/services/storage/providers/mock.provider.js';

describe('mock storage provider', () => {
  it('pins JSON deterministically', async () => {
    const provider = new MockStorageProvider();
    const result = await provider.pinJson({
      content: { hello: 'world' },
      name: 'example.json',
    });

    expect(result.provider).toBe('mock');
    expect(result.cid).toEqual(expect.stringMatching(/^bafy[0-9a-f]+$/));
    expect(result.ipfsUri).toBe(`ipfs://${result.cid}`);
    expect(result.gatewayUrl).toContain(result.cid);
  });

  it('pins files deterministically', async () => {
    const provider = new MockStorageProvider();
    const result = await provider.pinFile({
      content: Buffer.from('hello'),
      filename: 'hello.txt',
      mimeType: 'text/plain',
    });

    expect(result.provider).toBe('mock');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.ipfsUri).toBe(`ipfs://${result.cid}`);
  });
});

