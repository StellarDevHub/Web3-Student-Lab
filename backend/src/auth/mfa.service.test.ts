import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
  createMfaEnrollment,
} from './mfa.service.js';

describe('MFA / TOTP Service', () => {
  const sampleSecret = 'JBSWY3DPEHPK3PXP'; // Standard RFC test vector secret

  it('generates a valid base32 secret of expected length', () => {
    const secret = generateTotpSecret(20);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBe(20);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates a 6-digit TOTP code', () => {
    const code = generateTotpCode(sampleSecret);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('verifies valid TOTP token within current time window', () => {
    const code = generateTotpCode(sampleSecret);
    const isValid = verifyTotpCode(sampleSecret, code);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or expired TOTP tokens', () => {
    const isInvalid = verifyTotpCode(sampleSecret, '000000');
    expect(isInvalid).toBe(false);
  });

  it('generates, hashes, and validates single-use backup codes', () => {
    const { plain, hashed } = generateBackupCodes(8);
    expect(plain).toHaveLength(8);
    expect(hashed).toHaveLength(8);

    const firstCode = plain[0];
    const computedHash = hashBackupCode(firstCode);
    expect(computedHash).toBe(hashed[0]);
  });

  it('creates enrollment payload with QR code Data URL', async () => {
    const enrollment = await createMfaEnrollment('admin@web3studentlab.com');
    expect(enrollment.secret).toBeDefined();
    expect(enrollment.qrCodeUrl).toContain('data:image/png;base64,');
    expect(enrollment.backupCodes).toHaveLength(8);
  });
});
