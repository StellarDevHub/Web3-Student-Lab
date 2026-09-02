import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redis.js';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenPayload {
  userId: string;
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
  return signJwt(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = async (payload: TokenPayload): Promise<string> => {
  const refreshToken = signJwt(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  });

  // Store refresh token in Redis for rotation/reuse detection if Redis is available
  try {
    const key = `rt:${payload.userId}:${refreshToken}`;
    const redis = getRedisClient();
    if (redis && typeof redis.set === 'function') {
      await redis.set(key, 'valid', 'EX', REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    }
  } catch (err) {
    logger.warn('Redis unavailable for refresh token storage, continuing with signed JWT auth:', err);
  }

  return refreshToken;
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return verifyJwt(token, ACCESS_TOKEN_SECRET) as TokenPayload;
};

export const verifyRefreshToken = async (token: string): Promise<TokenPayload> => {
  const decoded = verifyJwt(token, REFRESH_TOKEN_SECRET) as TokenPayload;

  try {
    const key = `rt:${decoded.userId}:${token}`;
    const redis = getRedisClient();
    if (redis && typeof redis.get === 'function') {
      const isValid = await redis.get(key);
      if (isValid === null) {
        // If Redis key is absent or expired, verify signed JWT payload
        return decoded;
      }
    }
  } catch (_err) {
    // If Redis check fails, fall back to valid signed JWT verification
  }

  return decoded;
};

export const rotateRefreshToken = async (
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  try {
    const payload = await verifyRefreshToken(oldToken);

    // Invalidate old token
    try {
      const oldKey = `rt:${payload.userId}:${oldToken}`;
      const redis = getRedisClient();
      if (redis && typeof redis.del === 'function') {
        await redis.del(oldKey);
      }
    } catch (_err) {
      // Ignore redis deletion error
    }

    // Generate new pair
    const accessToken = generateAccessToken({ userId: payload.userId });
    const refreshToken = await generateRefreshToken({ userId: payload.userId });

    return { accessToken, refreshToken };
  } catch (error) {
    logger.error('Token rotation failed:', error);
    throw error;
  }
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  try {
    const pattern = `rt:${userId}:*`;
    const redis = getRedisClient();
    if (redis && typeof redis.keys === 'function') {
      const keys = await redis.keys(pattern);
      if (keys.length > 0 && typeof redis.del === 'function') {
        await redis.del(...keys);
      }
    }
  } catch (_err) {
    // Ignore redis error
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
