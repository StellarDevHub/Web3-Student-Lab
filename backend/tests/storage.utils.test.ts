import { describe, expect, it } from '@jest/globals';
import { buildGatewayUrl, buildIpfsUri, canonicalizeJson, createDeterministicCid } from '../src/services/storage/utils.js';

describe('storage utils', () => {
  it('canonicalizes nested JSON deterministically', () => {
    const payload = {
      z: 3,
      a: {
        y: 2,
        x: 1,
      },
      list: [
        {
          b: 2,
          a: 1,
        },
      ],
    };

    expect(canonicalizeJson(payload)).toBe(
      JSON.stringify({
        a: { x: 1, y: 2 },
        list: [{ a: 1, b: 2 }],
        z: 3,
      })
    );
  });

  it('builds IPFS URIs and gateway URLs', () => {
    const cid = 'bafy123';
    expect(buildIpfsUri(cid)).toBe('ipfs://bafy123');
    expect(buildGatewayUrl(cid)).toBe(`https://gateway.pinata.cloud/ipfs/${cid}`);
  });

  it('creates deterministic mock CIDs', () => {
    expect(createDeterministicCid('hello world')).toEqual(expect.stringMatching(/^bafy[0-9a-f]+$/));
  });
});

