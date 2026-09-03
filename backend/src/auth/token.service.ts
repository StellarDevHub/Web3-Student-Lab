import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redis.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const ROTATION_GRACE_PERIOD_MS = 10_000; // 10 seconds

export interface TokenPayload {
  userId: string;
  familyId?: string;
  tokenId?: string;
  [key: string]: any;
}

export interface TokenFamilyState {
  familyId: string;
  userId: string;
  currentTokenId: string;
  previousTokenId?: string;
  rotatedAt?: number;
  lastAccessToken?: string;
  lastRefreshToken?: string;
  status: 'active' | 'revoked';
  revokedAt?: number;
}

const signJwt = (payload: object, secret: string, options?: jwt.SignOptions): string => {
  const sign = jwt.sign || (jwt as any).default?.sign;
  return sign(payload, secret, options);
};

const verifyJwt = (token: string, secret: string): any => {
  const verify = jwt.verify || (jwt as any).default?.verify;
  return verify(token, secret);
};

export const generateAccessToken = (payload: TokenPayload): string => {
  const cleanPayload: { userId: string; [key: string]: any } = { userId: payload.userId };
  return signJwt(cleanPayload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = async (
  payload: TokenPayload,
  existingFamilyId?: string
): Promise<string> => {
  const familyId = existingFamilyId || payload.familyId || crypto.randomUUID();
  const tokenId = crypto.randomUUID();

  const tokenPayload: TokenPayload = {
    userId: payload.userId,
    familyId,
    tokenId,
  };

  const refreshToken = signJwt(tokenPayload, REFRESH_TOKEN_SECRET, {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  });

  const familyState: TokenFamilyState = {
    familyId,
    userId: payload.userId,
    currentTokenId: tokenId,
    status: 'active',
  };

  try {
    const redis = getRedisClient();
    if (redis && typeof redis.set === 'function') {
      const ttlSeconds = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
      await redis.set(`rt:fam:${familyId}`, JSON.stringify(familyState), 'EX', ttlSeconds);
      await redis.set(`rt:u:${payload.userId}:${familyId}`, '1', 'EX', ttlSeconds);
    }
  } catch (err) {
    logger.warn('Redis unavailable for refresh token storage:', err);
  }

  return refreshToken;
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return verifyJwt(token, getAccessTokenSecret()) as TokenPayload;
};

export const verifyRefreshToken = async (token: string): Promise<TokenPayload> => {
  let decoded: TokenPayload;
  try {
    decoded = verifyJwt(token, REFRESH_TOKEN_SECRET) as TokenPayload;
  } catch (_err) {
    throw new Error('Refresh token has been reused or revoked');
  }

  if (!decoded || !decoded.userId || !decoded.familyId || !decoded.tokenId) {
    throw new Error('Refresh token has been reused or revoked');
  }

  const redis = getRedisClient();
  if (!redis || typeof redis.get !== 'function') {
    // Strictly fail closed if Redis is unreachable
    throw new Error('Refresh token has been reused or revoked');
  }

  try {
    const familyKey = `rt:fam:${decoded.familyId}`;
    const familyData = await redis.get(familyKey);

    if (!familyData) {
      throw new Error('Refresh token has been reused or revoked');
    }

    let family: TokenFamilyState;
    try {
      family = JSON.parse(familyData);
    } catch {
      throw new Error('Refresh token has been reused or revoked');
    }

    if (family.status === 'revoked' || family.userId !== decoded.userId) {
      throw new Error('Refresh token has been reused or revoked');
    }

    if (decoded.tokenId === family.currentTokenId) {
      return decoded;
    }

    if (decoded.tokenId === family.previousTokenId) {
      const now = Date.now();
      const timeSinceRotation = now - (family.rotatedAt || 0);
      if (timeSinceRotation <= ROTATION_GRACE_PERIOD_MS) {
        return decoded;
      }
    }

    // Token presented is outside grace window or an invalid older token -> reuse/theft detected
    await revokeFamily(decoded.familyId);
    throw new Error('Refresh token has been reused or revoked');
  } catch (err: any) {
    if (err.message === 'Refresh token has been reused or revoked') {
      throw err;
    }
    logger.error('Redis error during verifyRefreshToken:', err);
    throw new Error('Refresh token has been reused or revoked');
  }
};

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const acquireDistributedLock = async (
  redis: any,
  lockKey: string,
  lockVal: string,
  ttlMs = 5000
): Promise<boolean> => {
  try {
    const res = await redis.set(lockKey, lockVal, 'PX', ttlMs, 'NX');
    return res === 'OK';
  } catch {
    return false;
  }
};

const releaseDistributedLock = async (
  redis: any,
  lockKey: string,
  lockVal: string
): Promise<void> => {
  try {
    if (typeof redis.eval === 'function') {
      await redis.eval(UNLOCK_SCRIPT, 1, lockKey, lockVal);
    }
  } catch (err) {
    logger.warn('Failed to release distributed lock via Lua script:', err);
  }
};

const inFlightRotations = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>();

export const rotateRefreshToken = async (
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  let decoded: TokenPayload;
  try {
    decoded = verifyJwt(oldToken, REFRESH_TOKEN_SECRET) as TokenPayload;
  } catch (_err) {
    throw new Error('Refresh token has been reused or revoked');
  }

  if (!decoded || !decoded.userId || !decoded.familyId || !decoded.tokenId) {
    throw new Error('Refresh token has been reused or revoked');
  }

  const inFlightKey = `${decoded.familyId}:${decoded.tokenId}`;
  const existingInFlight = inFlightRotations.get(inFlightKey);
  if (existingInFlight) {
    return await existingInFlight;
  }

  const rotationPromise = (async (): Promise<{ accessToken: string; refreshToken: string }> => {
    const redis = getRedisClient();
    if (!redis || typeof redis.get !== 'function' || typeof redis.set !== 'function') {
      // Strictly fail closed if Redis is unreachable
      throw new Error('Refresh token has been reused or revoked');
    }

    const lockKey = `rt:lock:${decoded.familyId}`;
    const lockVal = crypto.randomUUID();
    let lockAcquired = false;

    try {
      // Distributed lock for cross-process concurrency (handles multiple server pods)
      for (let attempt = 0; attempt < 5; attempt++) {
        lockAcquired = await acquireDistributedLock(redis, lockKey, lockVal, 5000);
        if (lockAcquired) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const familyKey = `rt:fam:${decoded.familyId}`;
      const now = Date.now();

      // If lock was not acquired after all retries, do NOT proceed unlocked!
      if (!lockAcquired) {
        // Check if another instance completed rotation and this token is now in grace period
        const cachedData = await redis.get(familyKey);
        if (cachedData) {
          try {
            const family: TokenFamilyState = JSON.parse(cachedData);
            if (family.status !== 'revoked' && family.userId === decoded.userId) {
              if (decoded.tokenId === family.previousTokenId) {
                const timeSinceRotation = now - (family.rotatedAt || 0);
                if (timeSinceRotation <= ROTATION_GRACE_PERIOD_MS) {
                  const accessToken = family.lastAccessToken || generateAccessToken({ userId: family.userId });
                  const refreshToken = family.lastRefreshToken;
                  if (refreshToken) {
                    return { accessToken, refreshToken };
                  }
                }
              }
            }
          } catch {
            // Ignore parse error and fail closed
          }
        }
        // If not in grace window, strictly fail closed — never rotate unlocked
        throw new Error('Refresh token has been reused or revoked');
      }

      const familyData = await redis.get(familyKey);

      if (!familyData) {
        throw new Error('Refresh token has been reused or revoked');
      }

      let family: TokenFamilyState;
      try {
        family = JSON.parse(familyData);
      } catch {
        throw new Error('Refresh token has been reused or revoked');
      }

      if (family.status === 'revoked' || family.userId !== decoded.userId) {
        throw new Error('Refresh token has been reused or revoked');
      }

      const ttlSeconds = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

      // Case 1: Current active token presented -> Rotate to next token in family
      if (decoded.tokenId === family.currentTokenId) {
        const newTokenId = crypto.randomUUID();
        const newPayload: TokenPayload = {
          userId: family.userId,
          familyId: family.familyId,
          tokenId: newTokenId,
        };

        const accessToken = generateAccessToken({ userId: family.userId });
        const refreshToken = signJwt(newPayload, REFRESH_TOKEN_SECRET, {
          expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
        });

        family.previousTokenId = family.currentTokenId;
        family.currentTokenId = newTokenId;
        family.rotatedAt = now;
        family.lastAccessToken = accessToken;
        family.lastRefreshToken = refreshToken;

        await redis.set(familyKey, JSON.stringify(family), 'EX', ttlSeconds);
        await redis.set(`rt:u:${family.userId}:${family.familyId}`, '1', 'EX', ttlSeconds);

        return { accessToken, refreshToken };
      }

      // Case 2: Immediately-previous token presented within 10s grace window -> Return active pair without re-rotating
      if (decoded.tokenId === family.previousTokenId) {
        const timeSinceRotation = now - (family.rotatedAt || 0);
        if (timeSinceRotation <= ROTATION_GRACE_PERIOD_MS) {
          const accessToken = family.lastAccessToken || generateAccessToken({ userId: family.userId });
          const refreshToken = family.lastRefreshToken;

          if (refreshToken) {
            return { accessToken, refreshToken };
          }
        }
      }

      // Case 3: Token presented is outside grace window or an invalid older token -> REUSE / THEFT DETECTED
      await revokeFamily(decoded.familyId!);
      throw new Error('Refresh token has been reused or revoked');
    } catch (err: any) {
      if (err.message === 'Refresh token has been reused or revoked') {
        throw err;
      }
      logger.error('Redis error during rotateRefreshToken:', err);
      throw new Error('Refresh token has been reused or revoked');
    } finally {
      if (lockAcquired) {
        await releaseDistributedLock(redis, lockKey, lockVal);
      }
    }
  })();

  inFlightRotations.set(inFlightKey, rotationPromise);
  try {
    return await rotationPromise;
  } finally {
    inFlightRotations.delete(inFlightKey);
  }
};

export const revokeFamily = async (familyId: string): Promise<void> => {
  const redis = getRedisClient();
  if (!redis || typeof redis.set !== 'function') {
    logger.error(`Cannot revoke token family ${familyId}: Redis client unavailable`);
    throw new Error('Failed to persist token family revocation');
  }

  const familyKey = `rt:fam:${familyId}`;
  const ttlSeconds = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
  let lastError: any = null;

  // Retry up to 3 times with exponential backoff to ensure the revocation write persists
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let userId: string | undefined;
      let family: TokenFamilyState;

      const familyData = typeof redis.get === 'function' ? await redis.get(familyKey) : null;
      if (familyData) {
        try {
          family = JSON.parse(familyData);
          userId = family.userId;
        } catch {
          family = { familyId, userId: '', currentTokenId: '', status: 'revoked' };
        }
      } else {
        family = { familyId, userId: '', currentTokenId: '', status: 'revoked' };
      }

      family.status = 'revoked';
      family.revokedAt = Date.now();

      await redis.set(familyKey, JSON.stringify(family), 'EX', ttlSeconds);

      if (userId && typeof redis.del === 'function') {
        try {
          await redis.del(`rt:u:${userId}:${familyId}`);
        } catch {
          // Non-critical user indexing cleanup failure
        }
      }

      logger.warn(`Token family revoked: ${familyId}`);
      return;
    } catch (err) {
      lastError = err;
      logger.warn(`Attempt ${attempt} to revoke token family ${familyId} failed:`, err);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 25));
      }
    }
  }

  // Emergency fallback: attempt to delete the key so subsequent requests fail closed
  if (typeof redis.del === 'function') {
    try {
      await redis.del(familyKey);
    } catch {
      // ignore
    }
  }

  logger.error(`Critical: Failed to revoke token family ${familyId} after retries:`, lastError);
  throw new Error('Failed to persist token family revocation');
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  try {
    const redis = getRedisClient();
    if (redis && typeof redis.keys === 'function') {
      const userFamilyKeys = await redis.keys(`rt:u:${userId}:*`);
      const familyIds: string[] = [];

      for (const key of userFamilyKeys) {
        const parts = key.split(':');
        const famId = parts[3] || parts[parts.length - 1];
        if (famId) {
          familyIds.push(famId);
        }
      }

      for (const familyId of familyIds) {
        try {
          await revokeFamily(familyId);
        } catch (err) {
          logger.error(`Failed to revoke family ${familyId} during user token revocation:`, err);
        }
      }

      if (userFamilyKeys.length > 0 && typeof redis.del === 'function') {
        await redis.del(...userFamilyKeys);
      }
    }
  } catch (err) {
    logger.error(`Error revoking all tokens for user ${userId}:`, err);
  }
  logger.warn(`All tokens revoked for user ${userId}`);
};

export const blacklistAccessToken = async (token: string, expirySeconds: number): Promise<void> => {
  try {
    const key = `bl:${token}`;
    const redis = getRedisClient();
    if (redis && typeof redis.set === 'function') {
      await redis.set(key, 'blacklisted', 'EX', expirySeconds);
    }
  } catch (_err) {
    // Ignore redis error
  }
};

export const isAccessTokenBlacklisted = async (token: string): Promise<boolean> => {
  try {
    const key = `bl:${token}`;
    const redis = getRedisClient();
    if (redis && typeof redis.get === 'function') {
      const result = await redis.get(key);
      return result === 'blacklisted';
    }
  } catch (_err) {
    // Ignore redis error
  }
  return false;
};

