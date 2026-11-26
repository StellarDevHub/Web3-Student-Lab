import { describe, expect, it } from 'vitest';

import { decodeScVal, formatValueForDisplay, safeDecodeScVal } from '@/lib/stellar/xdr-stream';

const ACCOUNT = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
const CONTRACT = 'CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR';

describe('decodeScVal', () => {
  describe('integers', () => {
    it('decodes signed 32-bit integers', () => {
      expect(decodeScVal('AAAABP///9Y=')).toEqual({
        type: 'integer',
        value: '-42',
        signed: true,
        bits: 32,
      });
    });

    it('decodes unsigned 32-bit integers', () => {
      expect(decodeScVal('AAAAAwAAACo=')).toEqual({
        type: 'integer',
        value: '42',
        signed: false,
        bits: 32,
      });
    });

    it('decodes 64-bit integers without precision loss', () => {
      expect(decodeScVal('AAAABv////3njuYA')).toEqual({
        type: 'integer',
        value: '-9000000000',
        signed: true,
        bits: 64,
      });
    });

    it('decodes the maximum unsigned 64-bit integer as a string', () => {
      expect(decodeScVal('AAAABf//////////')).toEqual({
        type: 'integer',
        value: '18446744073709551615',
        signed: false,
        bits: 64,
      });
    });

    it('decodes 128-bit integers without precision loss', () => {
      expect(decodeScVal('AAAACf////////////////////8=')).toEqual({
        type: 'integer',
        value: '340282366920938463463374607431768211455',
        signed: false,
        bits: 128,
      });
    });
  });

  describe('symbols', () => {
    it('decodes a symbol ScVal to its string name', () => {
      expect(decodeScVal('AAAADwAAAAh0cmFuc2Zlcg==')).toEqual({
        type: 'symbol',
        value: 'transfer',
      });
    });
  });

  describe('addresses', () => {
    it('decodes an account address to its StrKey form', () => {
      expect(decodeScVal('AAAAEgAAAAAAAAAAPww0v5OtDZlx0EzMkPcFURyDiq2XNKSi+w16A/x/6Jo=')).toEqual({
        type: 'address',
        value: ACCOUNT,
      });
    });

    it('decodes a contract address to its StrKey form', () => {
      expect(decodeScVal('AAAAEgAAAAEHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw==')).toEqual({
        type: 'address',
        value: CONTRACT,
      });
    });
  });

  describe('maps', () => {
    it('decodes map entries with mixed key and value types', () => {
      // { active: true, amount: 100, memo: "hello", to: <account address> }
      const decoded = decodeScVal(
        'AAAAEQAAAAEAAAAEAAAADgAAAAZhY3RpdmUAAAAAAAAAAAABAAAADgAAAAZhbW91bnQAAAAAAAUAAAAAAAAAZAAAAA4AAAAEbWVtbwAAAA4AAAAFaGVsbG8AAAAAAAAOAAAAAnRvAAAAAAASAAAAAAAAAAA/DDS/k60NmXHQTMyQ9wVRHIOKrZc0pKL7DXoD/H/omg=='
      );

      expect(decoded).toEqual({
        type: 'map',
        value: {
          active: { type: 'boolean', value: true },
          amount: { type: 'integer', value: '100', signed: false, bits: 64 },
          memo: { type: 'string', value: 'hello' },
          to: { type: 'address', value: ACCOUNT },
        },
      });
    });
  });

  describe('vectors and other types', () => {
    it('decodes nested vector elements', () => {
      // [1, 2, 3] encoded as i128 ScVals
      const decoded = decodeScVal(
        'AAAAEAAAAAEAAAADAAAACgAAAAAAAAAAAAAAAAAAAAEAAAAKAAAAAAAAAAAAAAAAAAAAAgAAAAoAAAAAAAAAAAAAAAAAAAAD'
      );

      expect(decoded).toEqual({
        type: 'vector',
        value: [
          { type: 'integer', value: '1', signed: true, bits: 128 },
          { type: 'integer', value: '2', signed: true, bits: 128 },
          { type: 'integer', value: '3', signed: true, bits: 128 },
        ],
      });
    });

    it('decodes booleans', () => {
      expect(decodeScVal('AAAAAAAAAAE=')).toEqual({ type: 'boolean', value: true });
    });

    it('decodes bytes as lowercase hex', () => {
      expect(decodeScVal('AAAADQAAAAIB/wAA')).toEqual({ type: 'bytes', value: '01ff' });
    });

    it('decodes void', () => {
      expect(decodeScVal('AAAAAQ==')).toEqual({ type: 'void', value: null });
    });
  });

  it('throws when the input is not a valid base64 ScVal', () => {
    expect(() => decodeScVal('invalid_base64_string')).toThrow();
  });
});

describe('safeDecodeScVal', () => {
  it('returns the native JavaScript value for valid ScVal XDR', () => {
    expect(safeDecodeScVal('AAAADwAAAAh0cmFuc2Zlcg==')).toBe('transfer');
  });

  it('falls back to the raw input for invalid XDR', () => {
    expect(safeDecodeScVal('invalid_base64_string')).toBe('invalid_base64_string');
  });

  it('returns null for empty input', () => {
    expect(safeDecodeScVal('')).toBeNull();
  });
});

describe('formatValueForDisplay', () => {
  it('renders objects as JSON and primitives as strings', () => {
    expect(formatValueForDisplay({ amount: '100 STLR' })).toBe('{"amount":"100 STLR"}');
    expect(formatValueForDisplay(123)).toBe('123');
    expect(formatValueForDisplay(null)).toBe('null');
  });
});
