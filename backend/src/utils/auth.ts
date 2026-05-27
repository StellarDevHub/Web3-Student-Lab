import jwt, { JsonWebTokenError, SignOptions } from 'jsonwebtoken';
import { getEnvVar } from './checkEnv.js';

/**
 * Token payload interface for JWT
 */
export interface TokenPayload {
  userId: string;
  email?: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
  type?: string;
  resetToken?: string;
}

/**
 * Token generation options interface
 */
export interface TokenOptions {
  expiresIn?: string;
  issuer?: string;
  audience?: string;
}

/**
 * Token verification result interface
 */
export interface TokenVerificationResult {
  valid: boolean;
  payload: TokenPayload | null;
  error?: string;
}

/**
 * Custom JWT errors
 */
export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class MalformedTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedTokenError';
  }
}

/**
 * Generate a JSON Web Token with enhanced options
 *
 * @param payload - Data to encode in the token
 * @param options - Optional token generation options
 * @returns Signed JWT string
 */
export const generateToken = (payload: TokenPayload, options: TokenOptions = {}): string => {
  const jwtSecret = getEnvVar('JWT_SECRET');

  const signOptions = {
    expiresIn: '7d',
    issuer: 'web3-student-lab',
    audience: 'web3-student-lab-users',
    ...(options || {}),
  } as SignOptions;

  return jwt.sign(payload, jwtSecret, signOptions);
};

/**
 * Verify a JSON Web Token with comprehensive error handling
 *
 * @param token - JWT string to verify
 * @returns TokenVerificationResult with validation status
 */
export const verifyToken = (token: string): TokenVerificationResult => {
  try {
    const jwtSecret = getEnvVar('JWT_SECRET');

    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

    return {
      valid: true,
      payload: decoded,
    };
  } catch (error: unknown) {
    if (error instanceof JsonWebTokenError) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          payload: null,
          error: 'Token has expired',
        };
      }

      // Check error message for more specific error types
      if (error.message.includes('malformed')) {
        return {
          valid: false,
          payload: null,
          error: 'Invalid token format',
        };
      }

      if (error.message.includes('invalid signature')) {
        return {
          valid: false,
          payload: null,
          error: 'Invalid token signature',
        };
      }

      // Generic JWT error
      return {
        valid: false,
        payload: null,
        error: 'Invalid token signature',
      };
    }

    // Non-JWT error or other error
    return {
      valid: false,
      payload: null,
      error: 'Invalid token format',
    };
  }
};

/**
 * Refresh an existing token by generating a new one
 *
 * @param userId - User ID for the new token
 * @param options - Optional token generation options
 * @returns New JWT string
 */
export const refreshToken = (userId: string, options: TokenOptions = {}): string => {
  const payload: TokenPayload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
  };

  return generateToken(payload, options);
};

/**
 * Validate token payload structure
 *
 * @param payload - Token payload to validate
 * @returns True if payload is valid
 */
export const validateTokenPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;

  if (!p.userId || typeof p.userId !== 'string') {
    return false;
  }

  if (p.exp && typeof p.exp === 'number') {
    const currentTime = Math.floor(Date.now() / 1000);
    if ((p.exp as number) < currentTime) {
      return false;
    }
  }

  return true;
};

/**
 * Extract token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns Token string or null
 */
export const extractTokenFromHeader = (authHeader: string): string | null => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7); // Remove 'Bearer ' prefix
};

/**
 * Generate a token for password reset
 *
 * @param userId - User ID
 * @param resetToken - Unique reset token
 * @param expiresIn - Custom expiration time
 * @returns JWT string
 */
export const generatePasswordResetToken = (
  userId: string,
  resetToken: string,
  expiresIn: string = '1h'
): string => {
  const payload: TokenPayload = {
    userId,
    resetToken,
    type: 'password-reset',
  };

  return generateToken(payload, { expiresIn });
};

/**
 * Verify a password reset token
 *
 * @param token - JWT string to verify
 * @returns TokenVerificationResult
 */
export const verifyPasswordResetToken = (token: string): TokenVerificationResult => {
  const result = verifyToken(token);

  if (result.valid && result.payload?.type !== 'password-reset') {
    return {
      valid: false,
      payload: null,
      error: 'Invalid token type',
    };
  }

  return result;
};

/**
 * Generate an email verification token
 *
 * @param email - User email
 * @param expiresIn - Custom expiration time
 * @returns JWT string
 */
export const generateEmailVerificationToken = (
  email: string,
  expiresIn: string = '24h'
): string => {
  const payload: TokenPayload = {
    userId: '', // Email verification tokens don't need userId
    email,
    type: 'email-verification',
  };

  return generateToken(payload, { expiresIn });
};

/**
 * Verify an email verification token
 *
 * @param token - JWT string to verify
 * @returns TokenVerificationResult
 */
export const verifyEmailVerificationToken = (token: string): TokenVerificationResult => {
  const result = verifyToken(token);

  if (result.valid && result.payload?.type !== 'email-verification') {
    return {
      valid: false,
      payload: null,
      error: 'Invalid token type',
    };
  }

  return result;
};
