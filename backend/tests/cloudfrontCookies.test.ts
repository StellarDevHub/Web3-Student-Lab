import { describe, expect, it } from '@jest/globals';
import {
  toCloudFrontSafeBase64,
  fromCloudFrontSafeBase64,
  createCustomPolicy,
  generateCloudFrontSignedCookies,
  verifyCloudFrontSignedCookies,
  matchResourcePattern,
  parseCookiesFromRequest,
  getOrCreateDefaultKeyPair,
} from '../src/services/cloudfrontCookieService.js';

describe('cloudfrontCookieService (BE-097 / #1844)', () => {
  it('converts to and from CloudFront safe base64 without +, = or /', () => {
    const rawString = 'Test string with multiple special characters for base64 encoding ?? & ++ // ==';
    const encoded = toCloudFrontSafeBase64(rawString);

    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('/');

    const decoded = fromCloudFrontSafeBase64(encoded).toString('utf8');
    expect(decoded).toBe(rawString);
  });

  it('creates minified JSON custom policy with DateLessThan condition', () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const policy = createCustomPolicy('*/courses/c1/videos/v1/*', expiry);

    const parsed = JSON.parse(policy);
    expect(parsed.Statement[0].Resource).toBe('*/courses/c1/videos/v1/*');
    expect(parsed.Statement[0].Condition.DateLessThan['AWS:EpochTime']).toBe(expiry);
  });

  it('matches resource patterns with wildcards correctly', () => {
    expect(matchResourcePattern('*/videos/v1/*', '/media/courses/c1/videos/v1/master.m3u8')).toBe(true);
    expect(matchResourcePattern('*/videos/v1/*', '/media/courses/c1/videos/v1/1080p_001.ts')).toBe(true);
    expect(matchResourcePattern('*/videos/v1/*', '/media/courses/c1/videos/v2/master.m3u8')).toBe(false);
    expect(matchResourcePattern('*', '/any/path')).toBe(true);
  });

  it('generates all three required CloudFront signed cookies', () => {
    const cookies = generateCloudFrontSignedCookies({
      resourceUrl: '*/media/courses/course-10/videos/video-20/*',
      expiresInSeconds: 3600,
    });

    expect(cookies['CloudFront-Key-Pair-Id']).toBeDefined();
    expect(cookies['CloudFront-Policy']).toBeDefined();
    expect(cookies['CloudFront-Signature']).toBeDefined();

    // Verify cookies do not contain standard base64 forbidden characters
    expect(cookies['CloudFront-Policy']).not.toMatch(/[+=/]/);
    expect(cookies['CloudFront-Signature']).not.toMatch(/[+=/]/);
  });

  it('successfully verifies freshly generated CloudFront signed cookies', () => {
    const resourceUrl = '*/media/courses/c1/videos/v1/*';
    const cookies = generateCloudFrontSignedCookies({
      resourceUrl,
      expiresInSeconds: 3600,
    });

    const check = verifyCloudFrontSignedCookies({
      cookies,
      requestUrl: '/media/courses/c1/videos/v1/master.m3u8',
    });

    expect(check.valid).toBe(true);
    expect(check.policy).toBeDefined();
  });

  it('rejects expired signed cookies', () => {
    const resourceUrl = '*/media/courses/c1/videos/v1/*';
    // Expire 10 seconds in the past
    const cookies = generateCloudFrontSignedCookies({
      resourceUrl,
      expiresInSeconds: -10,
    });

    const check = verifyCloudFrontSignedCookies({
      cookies,
      requestUrl: '/media/courses/c1/videos/v1/master.m3u8',
    });

    expect(check.valid).toBe(false);
    expect(check.reason).toBe('expired');
  });

  it('rejects signed cookies when accessed resource does not match policy pattern', () => {
    const cookies = generateCloudFrontSignedCookies({
      resourceUrl: '*/media/courses/course-A/videos/video-1/*',
      expiresInSeconds: 3600,
    });

    const check = verifyCloudFrontSignedCookies({
      cookies,
      requestUrl: '/media/courses/course-B/videos/video-99/master.m3u8',
    });

    expect(check.valid).toBe(false);
    expect(check.reason).toBe('resource_mismatch');
  });

  it('rejects tampered CloudFront signatures', () => {
    const cookies = generateCloudFrontSignedCookies({
      resourceUrl: '*/media/courses/c1/videos/v1/*',
      expiresInSeconds: 3600,
    });

    // Tamper with the signature
    const tamperedCookies = {
      ...cookies,
      'CloudFront-Signature': 'invalid-signature-content-here',
    };

    const check = verifyCloudFrontSignedCookies({
      cookies: tamperedCookies,
      requestUrl: '/media/courses/c1/videos/v1/master.m3u8',
    });

    expect(check.valid).toBe(false);
    expect(check.reason).toBe('invalid_signature');
  });

  it('returns missing_cookies when any required cookie is absent', () => {
    const check1 = verifyCloudFrontSignedCookies({
      cookies: { 'CloudFront-Key-Pair-Id': 'K1' },
      requestUrl: '/media/stream',
    });
    expect(check1.valid).toBe(false);
    expect(check1.reason).toBe('missing_cookies');
  });

  it('correctly parses cookies from HTTP cookie header', () => {
    const cookieHeader = 'CloudFront-Key-Pair-Id=K123; CloudFront-Policy=policy123; CloudFront-Signature=sig123; other=val';
    const parsed = parseCookiesFromRequest(cookieHeader);

    expect(parsed['CloudFront-Key-Pair-Id']).toBe('K123');
    expect(parsed['CloudFront-Policy']).toBe('policy123');
    expect(parsed['CloudFront-Signature']).toBe('sig123');
    expect(parsed['other']).toBe('val');
  });

  it('returns or creates an RSA keypair for signature generation', () => {
    const keyPair = getOrCreateDefaultKeyPair();
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.keyPairId).toBeDefined();
  });
});
