import { getCookieOptions, getRefreshTokenFromReq, REFRESH_TOKEN_COOKIE_NAME } from '../src/utils/cookie.js';
import { generateRefreshToken, rotateRefreshToken, verifyRefreshToken, revokeAllUserTokens } from '../src/auth/token.service.js';
import redis from '../src/utils/redis.js';

describe('Hardened Refresh Token Session Unit Tests', () => {
  beforeEach(async () => {
    // Clear redis keys if needed
  });

  describe('Cookie Configuration & Extraction', () => {
    it('should configure HttpOnly, environment-aware cookie options', () => {
      const options = getCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(options.sameSite).toBeDefined();
    });

    it('should extract refresh token from cookie header or request cookies', () => {
      const mockReqCookie = {
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: 'cookie-token-123' },
        headers: {},
      } as any;

      expect(getRefreshTokenFromReq(mockReqCookie)).toBe('cookie-token-123');

      const mockReqHeader = {
        headers: {
          cookie: 'someOther=val; refreshToken=header-token-456; foo=bar',
        },
      } as any;

      expect(getRefreshTokenFromReq(mockReqHeader)).toBe('header-token-456');
    });
  });

  describe('Refresh Token Lifecycle, Rotation & Reuse Detection', () => {
    const testUserId = 'test-user-session-123';

    it('should generate and verify valid refresh tokens', async () => {
      const token = await generateRefreshToken({ userId: testUserId });
      expect(token).toBeDefined();

      const payload = await verifyRefreshToken(token);
      expect(payload.userId).toBe(testUserId);
    });

    it('should rotate active token and invalidate the old one', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });
      const rotated = await rotateRefreshToken(initialToken);

      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(initialToken);

      // Old token should be invalidated/revoked
      await expect(verifyRefreshToken(initialToken)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should detect token reuse and revoke all user tokens', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });
      const secondToken = await generateRefreshToken({ userId: testUserId });

      // Rotate initial token to invalidate it
      await rotateRefreshToken(initialToken);

      // Reusing initial token must fail and revoke all tokens (including secondToken)
      await expect(rotateRefreshToken(initialToken)).rejects.toThrow('Refresh token has been reused or revoked');

      // Second token should also now be revoked due to reuse detection
      await expect(verifyRefreshToken(secondToken)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should revoke all tokens on session teardown/logout', async () => {
      const token = await generateRefreshToken({ userId: testUserId });
      await revokeAllUserTokens(testUserId);

      await expect(verifyRefreshToken(token)).rejects.toThrow('Refresh token has been reused or revoked');
    });
  });
});
