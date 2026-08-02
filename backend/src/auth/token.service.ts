import jwt from 'jsonwebtoken';
import redis from '../utils/redis.js';
import logger from '../utils/logger.js';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenPayload {
  userId: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = async (payload: TokenPayload): Promise<string> => {
  const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  });

  // Store refresh token in Redis for rotation/reuse detection
  // Key format: rt:<userId>:<tokenHash>
  const key = `rt:${payload.userId}:${refreshToken}`;
  await redis.set(key, 'valid', 'EX', REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60);

  return refreshToken;
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
};

export const verifyRefreshToken = async (token: string): Promise<TokenPayload> => {
  const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload;

  const key = `rt:${decoded.userId}:${token}`;
  const isValid = await redis.get(key);

  if (!isValid) {
    // Potential reuse detected! Revoke all tokens for this user
    await revokeAllUserTokens(decoded.userId);
    throw new Error('Refresh token has been reused or revoked');
  }

  return decoded;
};

export const rotateRefreshToken = async (
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  try {
    const payload = await verifyRefreshToken(oldToken);

    // Invalidate old token
    const oldKey = `rt:${payload.userId}:${oldToken}`;
    await redis.del(oldKey);

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
  const pattern = `rt:${userId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  logger.warn(`All tokens revoked for user ${userId}`);
};

export const blacklistAccessToken = async (token: string, expirySeconds: number): Promise<void> => {
  const key = `bl:${token}`;
  await redis.set(key, 'blacklisted', 'EX', expirySeconds);
};

export const isAccessTokenBlacklisted = async (token: string): Promise<boolean> => {
  const key = `bl:${token}`;
  const result = await redis.get(key);
  return result === 'blacklisted';
};
