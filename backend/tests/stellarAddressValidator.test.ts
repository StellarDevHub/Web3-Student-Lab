import { describe, expect, it } from '@jest/globals';
import {
  decodeMuxedAddress,
  identiconFromPublicKey,
  parseFederationServer,
  resolveFederationHandle,
  validateStellarAddress,
} from '../src/utils/stellarAddressValidator.js';

// Verified StrKey test vectors (checksum-valid, from the stellar SDK test suites).
const VALID_PUBLIC_KEY = 'GBBM6BKZPEHWYO3E3YKREDPQXMS4VK35YLNU7NFBRI26RAN7GI5POFBB';
const VALID_SECRET_SEED = 'SAB5556L5AN5KSR5WF7UOEFDCIODEWEO7H2UR4S5R62DFTQOGLKOVZDY';
const VALID_CONTRACT = 'CA2XT5OG4VUMHG773OQ5LHV57ZW3HZZNNZNBGOOOKMEYNXWXMNHXLWLJ';
// Muxed address with memo id 0 wrapping VALID_PUBLIC_KEY's base address.
const VALID_MUXED =
  'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ';
const MUXED_BASE_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

describe('Stellar Address Validator (#1114)', () => {
  describe('StrKey CRC16 checksum validation', () => {
    it('accepts valid G... public keys', () => {
      expect(validateStellarAddress(VALID_PUBLIC_KEY)).toEqual({
        valid: true,
        kind: 'public',
        normalized: VALID_PUBLIC_KEY,
      });
    });

    it('rejects public keys with corrupted checksums', () => {
      // Flip the final character — CRC16-XDR check must fail.
      const corrupted = VALID_PUBLIC_KEY.slice(0, -1) + 'X';
      const result = validateStellarAddress(corrupted);
      expect(result.valid).toBe(false);
      expect(result.kind).toBe('invalid');
      expect(result.reason).toMatch(/checksum/i);
    });

    it('accepts valid S... secret seeds and rejects bad ones', () => {
      expect(validateStellarAddress(VALID_SECRET_SEED).kind).toBe('secret');
      const corrupted = VALID_SECRET_SEED.slice(0, -1) + 'X';
      expect(validateStellarAddress(corrupted).valid).toBe(false);
    });

    it('accepts valid C... contract addresses and rejects bad ones', () => {
      expect(validateStellarAddress(VALID_CONTRACT).kind).toBe('contract');
      const corrupted = VALID_CONTRACT.slice(0, -1) + 'X';
      expect(validateStellarAddress(corrupted).valid).toBe(false);
    });

    it('rejects empty and unsupported input', () => {
      expect(validateStellarAddress('').valid).toBe(false);
      expect(validateStellarAddress('  ').valid).toBe(false);
      expect(validateStellarAddress('X123456789').valid).toBe(false);
      expect(validateStellarAddress('0xdeadbeef').valid).toBe(false);
    });
  });

  describe('Muxed (M...) address decoding', () => {
    it('recognizes muxed addresses and exposes base address + memo id', () => {
      const result = validateStellarAddress(VALID_MUXED);
      expect(result.valid).toBe(true);
      expect(result.kind).toBe('muxed');
      expect(result.memoId).toBe('0');
      expect(result.baseAddress).toBe(MUXED_BASE_ADDRESS);
    });

    it('exposes the decoded 64-bit memo id via decodeMuxedAddress', () => {
      const decoded = decodeMuxedAddress(VALID_MUXED);
      expect(decoded.valid).toBe(true);
      expect(decoded.memoId).toBe('0');
      expect(decoded.baseAddress).toMatch(/^G/);
      expect(decoded.baseAddress).toBe(MUXED_BASE_ADDRESS);
    });

    it('rejects malformed muxed addresses', () => {
      const result = decodeMuxedAddress('MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(result.valid).toBe(false);
      expect(result.kind).toBe('invalid');
    });
  });

  describe('Federation handles (SEP-0010)', () => {
    it('recognizes username*domain handles as federation kind', () => {
      const result = validateStellarAddress('alice*example.com');
      expect(result.valid).toBe(true);
      expect(result.kind).toBe('federation');
    });

    it('rejects malformed federation handles', () => {
      expect(validateStellarAddress('alice*').valid).toBe(false);
      expect(validateStellarAddress('*example.com').valid).toBe(false);
      expect(validateStellarAddress('alice@example.com').valid).toBe(false);
    });

    it('parses FEDERATION_SERVER from a stellar.toml document', () => {
      const toml = [
        'NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"',
        'FEDERATION_SERVER = "https://federation.example.com"',
        'ACCOUNTS = ["G..."]',
      ].join('\n');
      expect(parseFederationServer(toml)).toBe('https://federation.example.com');
    });

    it('rejects non-HTTPS federation servers', () => {
      expect(parseFederationServer('FEDERATION_SERVER = "http://federation.example.com"')).toBeNull();
    });

    it('resolves a handle via the federation server and returns the account id', async () => {
      const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
        const href = String(url);
        if (href.endsWith('/.well-known/stellar.toml')) {
          return new Response('FEDERATION_SERVER = "https://federation.example.com"', {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ account: { id: VALID_PUBLIC_KEY } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const account = await resolveFederationHandle(
        'alice*example.com',
        fakeFetch as unknown as typeof fetch,
      );
      expect(account).toBe(VALID_PUBLIC_KEY);
    });

    it('returns null when federation lookup fails', async () => {
      const failingFetch = async (): Promise<Response> =>
        new Response('not found', { status: 404 });

      const account = await resolveFederationHandle(
        'alice*example.com',
        failingFetch as unknown as typeof fetch,
      );
      expect(account).toBeNull();
    });

    it('returns null for invalid handles without any network call', async () => {
      const spyFetch = jest.fn();
      const account = await resolveFederationHandle(
        'not-a-handle',
        spyFetch as unknown as typeof fetch,
      );
      expect(account).toBeNull();
      expect(spyFetch).not.toHaveBeenCalled();
    });
  });

  describe('Deterministic identicon', () => {
    it('renders a 25-cell symmetric grid from a public key', () => {
      const grid = identiconFromPublicKey(VALID_PUBLIC_KEY);
      expect(grid).not.toBeNull();
      expect(grid).toHaveLength(25);
      // Symmetry: column 0 mirrors column 4 in every row.
      expect(grid![0]).toBe(grid![4]);
      expect(grid![5]).toBe(grid![9]);
    });

    it('is deterministic for the same key and different for different keys', () => {
      const first = identiconFromPublicKey(VALID_PUBLIC_KEY);
      const second = identiconFromPublicKey(VALID_PUBLIC_KEY);
      expect(first).toEqual(second);

      const otherKey =
        'GB7KKHHVYLDIZEKYJPAJUOTBE5E3NJAXPSDZK7O6O44WR3EBRO5HRPVT';
      const other = identiconFromPublicKey(otherKey);
      expect(other).not.toEqual(first);
    });

    it('returns null for invalid public keys', () => {
      expect(identiconFromPublicKey('G123456789')).toBeNull();
      expect(identiconFromPublicKey('')).toBeNull();
    });
  });
});
