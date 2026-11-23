import { describe, expect, it } from 'vitest';
import {
  OPERATIONS,
  visualizeHash,
  visualizeSymmetricEncrypt,
  visualizeRSAEncrypt,
  visualizeHMAC,
  visualizeECDSASign,
} from '../cryptoVisualizer';

describe('cryptoVisualizer', () => {
  describe('OPERATIONS', () => {
    it('exports all 5 operations with correct structure', () => {
      expect(OPERATIONS).toHaveLength(5);
      const ids = OPERATIONS.map((op) => op.id);
      expect(ids).toEqual(['hash', 'symmetric', 'asymmetric', 'hmac', 'ecdsa']);
      OPERATIONS.forEach((op) => {
        expect(op.name).toBeTruthy();
        expect(op.description).toBeTruthy();
        expect(op.category).toBeTruthy();
        expect(op.icon).toBeTruthy();
      });
    });
  });

  describe('visualizeHash', () => {
    it('returns a consistent hash for the same input', async () => {
      const r1 = await visualizeHash('Hello, Web3 World!');
      const r2 = await visualizeHash('Hello, Web3 World!');
      expect(r1.output).toBe(r2.output);
    });

    it('returns a different hash for different inputs', async () => {
      const r1 = await visualizeHash('input A');
      const r2 = await visualizeHash('input B');
      expect(r1.output).not.toBe(r2.output);
    });

    it('produces a 64-character hex string (SHA-256)', async () => {
      const result = await visualizeHash('test');
      expect(result.output).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(result.output)).toBe(true);
    });

    it('includes 2 steps: encode and hash', async () => {
      const result = await visualizeHash('data');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].label).toContain('Encode');
      expect(result.steps[1].label).toContain('SHA-256');
    });

    it('shows input text and byte length in first step', async () => {
      const input = 'Hello!';
      const result = await visualizeHash(input);
      const encodeStep = result.steps[0];
      expect(encodeStep.details.some((d) => d.value.includes(input))).toBe(true);
      expect(encodeStep.details.some((d) => d.value.includes('bytes'))).toBe(true);
    });

    it('shows hex, base64, and bit length in digest step', async () => {
      const result = await visualizeHash('abc');
      const hashStep = result.steps[1];
      expect(hashStep.details.some((d) => d.label === 'Digest (Hex)')).toBe(true);
      expect(hashStep.details.some((d) => d.label === 'Digest (Base64)')).toBe(true);
      expect(hashStep.details.some((d) => d.label === 'Digest Length')).toBe(true);
      expect(hashStep.details.some((d) => d.value.includes('256 bits'))).toBe(true);
    });

    it('handles empty string input', async () => {
      const result = await visualizeHash('');
      expect(result.output).toHaveLength(64);
      expect(result.steps).toHaveLength(2);
    });
  });

  describe('visualizeSymmetricEncrypt', () => {
    it('encrypts and decrypts successfully, returning matching plaintext', async () => {
      const result = await visualizeSymmetricEncrypt('Transfer 100 XLM');
      expect(result.steps).toHaveLength(4);
      const verifyStep = result.steps[3];
      const verifyDetail = verifyStep.details.find((d) => d.label === 'Verification');
      expect(verifyDetail?.value).toContain('PASS');
    });

    it('includes key generation, IV, encrypt, and decrypt steps', async () => {
      const result = await visualizeSymmetricEncrypt('data');
      expect(result.steps[0].label).toContain('Generate AES');
      expect(result.steps[1].label).toContain('Initialization Vector');
      expect(result.steps[2].label).toContain('Encrypt');
      expect(result.steps[3].label).toContain('Decrypt');
    });

    it('shows key and IV details', async () => {
      const result = await visualizeSymmetricEncrypt('test');
      const keyStep = result.steps[0];
      const ivStep = result.steps[1];
      expect(keyStep.details.some((d) => d.label === 'Key (Hex)')).toBe(true);
      expect(keyStep.details.some((d) => d.value.includes('256 bits'))).toBe(true);
      expect(ivStep.details.some((d) => d.label === 'IV (Hex)')).toBe(true);
      expect(ivStep.details.some((d) => d.value.includes('96 bits'))).toBe(true);
    });

    it('produces different output for the same input (due to random IV)', async () => {
      const r1 = await visualizeSymmetricEncrypt('same message');
      const r2 = await visualizeSymmetricEncrypt('same message');
      expect(r1.output).not.toBe(r2.output);
    });
  });

  describe('visualizeRSAEncrypt', () => {
    it('encrypts and decrypts successfully', async () => {
      const result = await visualizeRSAEncrypt('secret message');
      expect(result.steps).toHaveLength(3);
      const verifyStep = result.steps[2];
      const verifyDetail = verifyStep.details.find((d) => d.label === 'Verification');
      expect(verifyDetail?.value).toContain('PASS');
    });

    it('includes key generation, encrypt, and decrypt steps', async () => {
      const result = await visualizeRSAEncrypt('data');
      expect(result.steps[0].label).toContain('Generate RSA');
      expect(result.steps[1].label).toContain('Encrypt');
      expect(result.steps[2].label).toContain('Decrypt');
    });

    it('shows public key details and modulus length', async () => {
      const result = await visualizeRSAEncrypt('hi');
      const keyStep = result.steps[0];
      expect(keyStep.details.some((d) => d.label === 'Public Key (n modulus)')).toBe(true);
      expect(keyStep.details.some((d) => d.label === 'Modulus Length')).toBe(true);
      expect(keyStep.details.some((d) => d.value.includes('2048 bits'))).toBe(true);
    });
  });

  describe('visualizeHMAC', () => {
    it('produces a valid HMAC and verifies successfully', async () => {
      const result = await visualizeHMAC('secret', 'authenticated message');
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].label).toContain('Import');
      expect(result.steps[1].label).toContain('HMAC');
      expect(result.steps[2].label).toContain('Verify');

      const verifyDetail = result.steps[2].details.find((d) => d.label === 'Verification');
      expect(verifyDetail?.value).toContain('PASS');
    });

    it('produces a 64-character hex HMAC', async () => {
      const result = await visualizeHMAC('key', 'message');
      expect(result.output).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(result.output)).toBe(true);
    });

    it('shows key bytes and HMAC details', async () => {
      const result = await visualizeHMAC('mykey', 'msg');
      const importStep = result.steps[0];
      const hmacStep = result.steps[1];
      expect(importStep.details.some((d) => d.label === 'Key (Hex)')).toBe(true);
      expect(hmacStep.details.some((d) => d.label === 'HMAC (Hex)')).toBe(true);
      expect(hmacStep.details.some((d) => d.label === 'HMAC (Base64)')).toBe(true);
    });

    it('produces different HMACs for different keys', async () => {
      const r1 = await visualizeHMAC('key-a', 'same message');
      const r2 = await visualizeHMAC('key-b', 'same message');
      expect(r1.output).not.toBe(r2.output);
    });
  });

  describe('visualizeECDSASign', () => {
    it('signs and verifies successfully', async () => {
      const result = await visualizeECDSASign('deploy contract');
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].label).toContain('Generate ECDSA');
      expect(result.steps[1].label).toContain('Sign');
      expect(result.steps[2].label).toContain('Verify');

      const verifyDetail = result.steps[2].details.find((d) => d.label === 'Verification');
      expect(verifyDetail?.value).toContain('PASS');
    });

    it('shows public key and signature details', async () => {
      const result = await visualizeECDSASign('hello');
      const keyStep = result.steps[0];
      const signStep = result.steps[1];
      expect(keyStep.details.some((d) => d.label === 'Public Key (x)')).toBe(true);
      expect(keyStep.details.some((d) => d.label === 'Public Key (y)')).toBe(true);
      expect(signStep.details.some((d) => d.label === 'Signature (Hex)')).toBe(true);
      expect(signStep.details.some((d) => d.label === 'Signature (Base64)')).toBe(true);
    });

    it('produces different signatures for different messages', async () => {
      const r1 = await visualizeECDSASign('msg 1');
      const r2 = await visualizeECDSASign('msg 2');
      expect(r1.output).not.toBe(r2.output);
    });
  });
});
