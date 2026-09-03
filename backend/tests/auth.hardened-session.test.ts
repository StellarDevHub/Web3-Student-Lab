import { getCookieOptions, getRefreshTokenFromReq, REFRESH_TOKEN_COOKIE_NAME } from '../src/utils/cookie.js';
import {
  generateRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
  revokeAllUserTokens,
  revokeFamily,
  ROTATION_GRACE_PERIOD_MS,
} from '../src/auth/token.service.js';
import redis from '../src/utils/redis.js';

describe('Hardened Refresh Token Session Unit & Concurrency Tests', () => {
  const testUserId = 'test-user-session-123';
  const otherUserId = 'other-user-session-456';

  beforeEach(async () => {
    jest.restoreAllMocks();
    // Clean up all test keys in redis
    if (redis && typeof redis.keys === 'function') {
      const keys = await redis.keys('rt:*');
      if (keys.length > 0 && typeof redis.del === 'function') {
        await redis.del(...keys);
      }
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Cookie Configuration & Extraction', () => {
    it('should configure HttpOnly, environment-aware cookie options', () => {
      const options = getRefreshTokenCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/api/v1/auth');
      expect(options.sameSite).toBe('strict');
      expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should extract refresh token from cookie header or request cookies', () => {
      const tokenVal = 'sample.refresh.token';

      // 1. From req.cookies object
      const reqWithCookies = {
        cookies: { refreshToken: tokenVal },
        headers: {},
      } as unknown as Request;
      expect(getRefreshTokenFromReq(reqWithCookies)).toBe(tokenVal);

      // 2. From raw Cookie header string
      const reqWithHeader = {
        headers: { cookie: `other=123; refreshToken=${tokenVal}; lang=en` },
      } as unknown as Request;
      expect(getRefreshTokenFromReq(reqWithHeader)).toBe(tokenVal);

      // 3. From request body
      const reqWithBody = {
        body: { refreshToken: tokenVal },
        headers: {},
      } as unknown as Request;
      expect(getRefreshTokenFromReq(reqWithBody)).toBe(tokenVal);
    });
  });

  describe('Refresh Token Lifecycle & Grace Period Unit Tests', () => {
    it('should generate and verify valid refresh tokens', async () => {
      const token = await generateRefreshToken({ userId: testUserId });
      expect(typeof token).toBe('string');

      const payload = await verifyRefreshToken(token);
      expect(payload.userId).toBe(testUserId);
      expect(payload.familyId).toBeDefined();
      expect(payload.tokenId).toBeDefined();
    });

    it('should rotate active token and return a new token pair', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });
      const initialPayload = await verifyRefreshToken(initialToken);

      const rotated = await rotateRefreshToken(initialToken);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(initialToken);

      // The new token should be valid
      const newPayload = await verifyRefreshToken(rotated.refreshToken);
      expect(newPayload.userId).toBe(testUserId);
    });

    it('should accept immediately-previous token during 10-second grace period without re-rotating', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });
      const firstRotation = await rotateRefreshToken(initialToken);

      // Presenting the initialToken again within grace period should succeed
      const secondRotation = await rotateRefreshToken(initialToken);

      // Must return the existing rotated refresh token (no rotation storm)
      expect(secondRotation.refreshToken).toBe(firstRotation.refreshToken);
      expect(secondRotation.accessToken).toBeDefined();

      // verifyRefreshToken on previous token should also succeed within grace period
      const payload = await verifyRefreshToken(initialToken);
      expect(payload.userId).toBe(testUserId);
    });

    it('should reject previous token after 10-second grace period and revoke token family', async () => {
      const baseTime = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      const initialToken = await generateRefreshToken({ userId: testUserId });
      const rotated = await rotateRefreshToken(initialToken);

      // Advance time past the 10-second grace period (e.g. 11 seconds later)
      jest.spyOn(Date, 'now').mockReturnValue(baseTime + ROTATION_GRACE_PERIOD_MS + 1000);

      // Reusing initial token after grace window must fail with reuse error
      await expect(rotateRefreshToken(initialToken)).rejects.toThrow('Refresh token has been reused or revoked');

      // The whole family must now be revoked: the newest token should also be rejected
      await expect(verifyRefreshToken(rotated.refreshToken)).rejects.toThrow('Refresh token has been reused or revoked');
      await expect(rotateRefreshToken(rotated.refreshToken)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should instantly detect reuse of older ancestor tokens (2+ rotations ago) and revoke lineage', async () => {
      const baseTime = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      const token1 = await generateRefreshToken({ userId: testUserId });
      const rotation1 = await rotateRefreshToken(token1);
      const token2 = rotation1.refreshToken;

      const rotation2 = await rotateRefreshToken(token2);
      const token3 = rotation2.refreshToken;

      // token1 is now 2 generations old (token1 -> token2 -> token3).
      // Presenting token1 must be immediately detected as reuse/theft
      await expect(rotateRefreshToken(token1)).rejects.toThrow('Refresh token has been reused or revoked');

      // token3 (the current legitimate token) must now be revoked due to family revocation
      await expect(verifyRefreshToken(token3)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should revoke all user tokens on session teardown/logout across all devices', async () => {
      const session1Token = await generateRefreshToken({ userId: testUserId });
      const session2Token = await generateRefreshToken({ userId: testUserId });
      const otherUserToken = await generateRefreshToken({ userId: otherUserId });

      await revokeAllUserTokens(testUserId);

      // Both sessions for testUserId should be revoked
      await expect(verifyRefreshToken(session1Token)).rejects.toThrow('Refresh token has been reused or revoked');
      await expect(verifyRefreshToken(session2Token)).rejects.toThrow('Refresh token has been reused or revoked');

      // Other user's session should remain valid
      const otherPayload = await verifyRefreshToken(otherUserToken);
      expect(otherPayload.userId).toBe(otherUserId);
    });

    it('should isolate family revocation to the targeted family only', async () => {
      const family1Token = await generateRefreshToken({ userId: testUserId });
      const family2Token = await generateRefreshToken({ userId: testUserId });

      const decoded1 = await verifyRefreshToken(family1Token);
      await revokeFamily(decoded1.familyId!);

      // Family 1 is revoked
      await expect(verifyRefreshToken(family1Token)).rejects.toThrow('Refresh token has been reused or revoked');

      // Family 2 remains active
      const decoded2 = await verifyRefreshToken(family2Token);
      expect(decoded2.userId).toBe(testUserId);
    });

    it('should fail closed during verifyRefreshToken if Redis is unreachable or throws an error', async () => {
      const token = await generateRefreshToken({ userId: testUserId });

      // Force redis.get to throw a network/connection error
      jest.spyOn(redis, 'get').mockRejectedValueOnce(new Error('Redis connection lost'));

      await expect(verifyRefreshToken(token)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should fail closed during rotateRefreshToken if Redis is unreachable or throws an error', async () => {
      const token = await generateRefreshToken({ userId: testUserId });

      // Force redis.get to throw an error during rotation
      jest.spyOn(redis, 'get').mockRejectedValueOnce(new Error('Redis cluster down'));

      await expect(rotateRefreshToken(token)).rejects.toThrow('Refresh token has been reused or revoked');
    });
  });

  describe('Concurrent Request Integration Tests', () => {
    it('should handle 10 concurrent in-flight refresh calls using the same token without false-positive lockouts', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });

      // Simulate 10 simultaneous refresh requests presenting the exact same initialToken
      const concurrencyCount = 10;
      const refreshPromises = Array.from({ length: concurrencyCount }, () =>
        rotateRefreshToken(initialToken)
      );

      const results = await Promise.all(refreshPromises);

      // All 10 requests must succeed
      expect(results).toHaveLength(concurrencyCount);

      // All requests must return valid access tokens
      results.forEach((res) => {
        expect(res.accessToken).toBeDefined();
        expect(res.refreshToken).toBeDefined();
      });

      // Exactly ONE canonical new refresh token should have been returned across all concurrent callers
      const canonicalRefreshToken = results[0]!.refreshToken;
      results.forEach((res) => {
        expect(res.refreshToken).toBe(canonicalRefreshToken);
      });

      // The canonical refresh token must be valid and verifiable
      const payload = await verifyRefreshToken(canonicalRefreshToken);
      expect(payload.userId).toBe(testUserId);
    });

    it('should handle high-concurrency race during token theft event and enforce atomic family revocation', async () => {
      const baseTime = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      const initialToken = await generateRefreshToken({ userId: testUserId });
      const rotated = await rotateRefreshToken(initialToken);
      const legitimateToken = rotated.refreshToken;

      // Fast forward past the grace window
      jest.spyOn(Date, 'now').mockReturnValue(baseTime + ROTATION_GRACE_PERIOD_MS + 5000);

      // Simulate parallel requests: 5 theft attempts using expired initialToken and 5 legitimate attempts using legitimateToken
      const theftAttempts = Array.from({ length: 5 }, () =>
        rotateRefreshToken(initialToken).catch((err) => err)
      );
      const legitimateAttempts = Array.from({ length: 5 }, () =>
        rotateRefreshToken(legitimateToken).catch((err) => err)
      );

      const allResults = await Promise.all([...theftAttempts, ...legitimateAttempts]);

      // All theft attempts must be rejected with reuse error
      const theftResults = allResults.slice(0, 5);
      theftResults.forEach((res) => {
        expect(res).toBeInstanceOf(Error);
        expect((res as Error).message).toBe('Refresh token has been reused or revoked');
      });

      // Family must be universally revoked
      await expect(verifyRefreshToken(legitimateToken)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should remain deterministic across rapid successive rotation and grace verification cycles', async () => {
      let currentToken = await generateRefreshToken({ userId: testUserId });

      for (let cycle = 0; cycle < 5; cycle++) {
        const rotated = await rotateRefreshToken(currentToken);
        expect(rotated.refreshToken).toBeDefined();
        expect(rotated.refreshToken).not.toBe(currentToken);

        // Immediate concurrent verification of previous token in grace window
        const [prevVerified, currVerified] = await Promise.all([
          verifyRefreshToken(currentToken),
          verifyRefreshToken(rotated.refreshToken),
        ]);

        expect(prevVerified.userId).toBe(testUserId);
        expect(currVerified.userId).toBe(testUserId);

        currentToken = rotated.refreshToken;
      }
    });

    it('should fail closed during rotateRefreshToken if Redis is unreachable or throws an error', async () => {
      const token = await generateRefreshToken({ userId: testUserId });

      // Force redis.get to throw an error during rotation
      jest.spyOn(redis, 'get').mockRejectedValueOnce(new Error('Redis cluster down'));

      await expect(rotateRefreshToken(token)).rejects.toThrow('Refresh token has been reused or revoked');
    });
  });

  describe('Concurrent Request Integration Tests', () => {
    it('should handle 10 concurrent in-flight refresh calls using the same token without false-positive lockouts', async () => {
      const initialToken = await generateRefreshToken({ userId: testUserId });

      // Simulate 10 simultaneous refresh requests presenting the exact same initialToken
      const concurrencyCount = 10;
      const refreshPromises = Array.from({ length: concurrencyCount }, () =>
        rotateRefreshToken(initialToken)
      );

      const results = await Promise.all(refreshPromises);

      // All 10 requests must succeed
      expect(results).toHaveLength(concurrencyCount);

      // All requests must return valid access tokens
      results.forEach((res) => {
        expect(res.accessToken).toBeDefined();
        expect(res.refreshToken).toBeDefined();
      });

      // Exactly ONE canonical new refresh token should have been returned across all concurrent callers
      const canonicalRefreshToken = results[0]!.refreshToken;
      results.forEach((res) => {
        expect(res.refreshToken).toBe(canonicalRefreshToken);
      });

      // The canonical refresh token must be valid and verifiable
      const payload = await verifyRefreshToken(canonicalRefreshToken);
      expect(payload.userId).toBe(testUserId);
    });

    it('should handle high-concurrency race during token theft event and enforce atomic family revocation', async () => {
      const baseTime = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      const initialToken = await generateRefreshToken({ userId: testUserId });
      const rotated = await rotateRefreshToken(initialToken);
      const legitimateToken = rotated.refreshToken;

      // Fast forward past the grace window
      jest.spyOn(Date, 'now').mockReturnValue(baseTime + ROTATION_GRACE_PERIOD_MS + 5000);

      // Simulate parallel requests: 5 theft attempts using expired initialToken and 5 legitimate attempts using legitimateToken
      const theftAttempts = Array.from({ length: 5 }, () =>
        rotateRefreshToken(initialToken).catch((err) => err)
      );
      const legitimateAttempts = Array.from({ length: 5 }, () =>
        rotateRefreshToken(legitimateToken).catch((err) => err)
      );

      const allResults = await Promise.all([...theftAttempts, ...legitimateAttempts]);

      // All theft attempts must be rejected with reuse error
      const theftResults = allResults.slice(0, 5);
      theftResults.forEach((res) => {
        expect(res).toBeInstanceOf(Error);
        expect((res as Error).message).toBe('Refresh token has been reused or revoked');
      });

      // Family must be universally revoked
      await expect(verifyRefreshToken(legitimateToken)).rejects.toThrow('Refresh token has been reused or revoked');
    });

    it('should remain deterministic across rapid successive rotation and grace verification cycles', async () => {
      let currentToken = await generateRefreshToken({ userId: testUserId });

      for (let cycle = 0; cycle < 5; cycle++) {
        const rotated = await rotateRefreshToken(currentToken);
        expect(rotated.refreshToken).toBeDefined();
        expect(rotated.refreshToken).not.toBe(currentToken);

        // Immediate concurrent verification of previous token in grace window
        const [prevVerified, currVerified] = await Promise.all([
          verifyRefreshToken(currentToken),
          verifyRefreshToken(rotated.refreshToken),
        ]);

        expect(prevVerified.userId).toBe(testUserId);
        expect(currVerified.userId).toBe(testUserId);

        currentToken = rotated.refreshToken;
      }
    });
  });

  describe('Token Secret Fail-Closed Hardening', () => {
    const savedAccessSecret = process.env.ACCESS_TOKEN_SECRET;
    const savedJwtSecret = process.env.JWT_SECRET;
    const savedRefreshSecret = process.env.REFRESH_TOKEN_SECRET;

    afterEach(() => {
      process.env.ACCESS_TOKEN_SECRET = savedAccessSecret;
      process.env.JWT_SECRET = savedJwtSecret;
      process.env.REFRESH_TOKEN_SECRET = savedRefreshSecret;
    });

    it('should throw an explicit error if ACCESS_TOKEN_SECRET is not configured', () => {
      delete process.env.ACCESS_TOKEN_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => generateAccessToken({ userId: testUserId })).toThrow(
        'ACCESS_TOKEN_SECRET is not configured'
      );
      expect(() => verifyAccessToken('some.token.value')).toThrow(
        'ACCESS_TOKEN_SECRET is not configured'
      );
    });

    it('should throw an explicit error if REFRESH_TOKEN_SECRET is not configured', async () => {
      delete process.env.REFRESH_TOKEN_SECRET;

      await expect(generateRefreshToken({ userId: testUserId })).rejects.toThrow(
        'REFRESH_TOKEN_SECRET is not configured'
      );
      await expect(verifyRefreshToken('some.token.value')).rejects.toThrow(
        'Refresh token has been reused or revoked'
      );
    });
  });
});
