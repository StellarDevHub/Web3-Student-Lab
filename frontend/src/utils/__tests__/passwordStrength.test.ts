import { describe, it, expect, vi } from 'vitest';
import { calculatePasswordStrength } from '../passwordStrength';
import { checkPasswordBreached, sha1Hex } from '../pwnedPasswordCheck';

describe('Password Strength Calculator (zxcvbn score specifications)', () => {
  it('should return score 0 for empty or very weak passwords', () => {
    const emptyResult = calculatePasswordStrength('');
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.isValid).toBe(false);

    const weakResult = calculatePasswordStrength('12345');
    expect(weakResult.score).toBe(0);
    expect(weakResult.isValid).toBe(false);
  });

  it('should penalize common dictionary words and patterns', () => {
    const result = calculatePasswordStrength('password123');
    expect(result.warning).toContain('password');
    expect(result.isValid).toBe(false);
  });

  it('should require minimum score 3 for valid passwords', () => {
    const weakPass = calculatePasswordStrength('Password123');
    expect(weakPass.score).toBeLessThan(3);
    expect(weakPass.isValid).toBe(false);

    const strongPassphrase = calculatePasswordStrength('C0rect-Horse-B@tterystaple-2026!');
    expect(strongPassphrase.score).toBeGreaterThanOrEqual(3);
    expect(strongPassphrase.isValid).toBe(true);
  });
});

describe('HaveIBeenPwned k-Anonymity Check', () => {
  it('should compute valid 40-character uppercase SHA-1 hash hex', async () => {
    const hash = await sha1Hex('password');
    expect(hash).toHaveLength(40);
    expect(hash).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('should detect breached passwords via HIBP API response mocking', async () => {
    const mockResponseText = `0018A45C4D1DEF81644B54AB7F969B88D65:10\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3865892\nFFFAAAAA:1`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    }));

    const result = await checkPasswordBreached('password');
    expect(result.isBreached).toBe(true);
    expect(result.count).toBe(3865892);

    vi.unstubAllGlobals();
  });

  it('should confirm unbreached status when hash suffix is not found in HIBP response', async () => {
    const mockResponseText = `00000000000000000000000000000000000:1`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    }));

    const result = await checkPasswordBreached('UniqueSecurePassphrase123!@#');
    expect(result.isBreached).toBe(false);
    expect(result.count).toBe(0);

    vi.unstubAllGlobals();
  });
});
