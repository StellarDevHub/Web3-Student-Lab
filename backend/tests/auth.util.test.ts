import {
  extractTokenFromHeader,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  generateToken,
  InvalidTokenError,
  MalformedTokenError,
  refreshToken,
  TokenExpiredError,
  TokenPayload,
  validateTokenPayload,
  verifyEmailVerificationToken,
  verifyPasswordResetToken,
  verifyToken,
} from '../src/utils/auth.js';

// Mock process.env for testing
const originalEnv = process.env;

describe('JWT Authentication Utility', () => {
  beforeEach(() => {
    // Set a valid JWT secret for testing
    process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing-123456789';
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'student',
      };

      const token = generateToken(payload);

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should generate token with custom options', () => {
      const payload: TokenPayload = { userId: 'user123' };
      const options = {
        expiresIn: '1h',
        issuer: 'custom-issuer',
        audience: 'custom-audience',
      };

      const token = generateToken(payload, options);

      expect(typeof token).toBe('string');

      // Verify the token was created with custom options
      const decoded = verifyToken(token);
      expect(decoded.valid).toBe(true);
      expect(decoded.payload?.userId).toBe('user123');
    });

    it('should throw error if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;

      expect(() => generateToken({ userId: 'user123' })).toThrow();
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload: TokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'student',
      };

      const token = generateToken(payload);
      const result = verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('user123');
      expect(result.payload?.email).toBe('test@example.com');
      expect(result.payload?.role).toBe('student');
    });

    it('should return invalid for expired token', () => {
      // Create a token with short expiration
      const payload: TokenPayload = { userId: 'user123' };
      const options = { expiresIn: '1ms' }; // Very short expiration
      const token = generateToken(payload, options);

      // Wait a bit to ensure token expires
      setTimeout(() => {
        const result = verifyToken(token);
        expect(result.valid).toBe(false);
        expect(result.payload).toBeNull();
        expect(result.error).toBe('Token has expired');
      }, 10);
    });

    it('should return invalid for malformed token', () => {
      const malformedToken = 'not.a.jwt.token';

      const result = verifyToken(malformedToken);

      expect(result.valid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toBe('Invalid token format');
    });

    it('should return invalid for token with wrong signature', () => {
      // Generate token with different secret
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'different-secret';

      const payload: TokenPayload = { userId: 'user123' };
      const token = generateToken(payload);

      // Restore original secret
      process.env.JWT_SECRET = originalSecret;

      const result = verifyToken(token);

      expect(result.valid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toBe('Invalid token signature');
    });

    it('should return invalid if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;

      const token = 'some.valid.jwt.token';
      const result = verifyToken(token);

      expect(result.valid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('refreshToken', () => {
    it('should generate a new token for user', () => {
      const token = refreshToken('user123');

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      // Verify the new token
      const result = verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('user123');
    });

    it('should include iat claim in refreshed token', () => {
      const token = refreshToken('user123');
      const result = verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.iat).toBeDefined();
      expect(typeof result.payload?.iat).toBe('number');
    });
  });

  describe('validateTokenPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      expect(validateTokenPayload(payload)).toBe(true);
    });

    it('should return false for null payload', () => {
      expect(validateTokenPayload(null)).toBe(false);
      expect(validateTokenPayload(undefined)).toBe(false);
    });

    it('should return false for non-object payload', () => {
      expect(validateTokenPayload('string')).toBe(false);
      expect(validateTokenPayload(123)).toBe(false);
    });

    it('should return false for payload without userId', () => {
      const payload = { email: 'test@example.com' };
      expect(validateTokenPayload(payload)).toBe(false);
    });

    it('should return false for expired token', () => {
      const payload = {
        userId: 'user123',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      expect(validateTokenPayload(payload)).toBe(false);
    });

    it('should return false for non-string userId', () => {
      const payload = { userId: 123, exp: Math.floor(Date.now() / 1000) + 3600 };
      expect(validateTokenPayload(payload)).toBe(false);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const authHeader = 'Bearer abc123.token.here';
      const token = extractTokenFromHeader(authHeader);

      expect(token).toBe('abc123.token.here');
    });

    it('should return null for header without Bearer prefix', () => {
      const authHeader = 'Basic abc123';
      const token = extractTokenFromHeader(authHeader);

      expect(token).toBeNull();
    });

    it('should return null for empty header', () => {
      const token = extractTokenFromHeader('');
      expect(token).toBeNull();
    });

    it('should return null for null header', () => {
      const token = extractTokenFromHeader(null as unknown as string);
      expect(token).toBeNull();
    });

    it('should return null for non-string header', () => {
      const token = extractTokenFromHeader(123 as unknown as string);
      expect(token).toBeNull();
    });
  });

  describe('Password Reset Tokens', () => {
    it('should generate password reset token', () => {
      const token = generatePasswordResetToken('user123', 'reset-token-abc');

      expect(typeof token).toBe('string');

      const result = verifyPasswordResetToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('user123');
      expect(result.payload?.resetToken).toBe('reset-token-abc');
      expect(result.payload?.type).toBe('password-reset');
    });

    it('should verify password reset token', () => {
      const token = generatePasswordResetToken('user123', 'reset-token-abc');
      const result = verifyPasswordResetToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.type).toBe('password-reset');
    });

    it('should reject password reset token with wrong type', () => {
      const token = generateToken({ userId: 'user123', type: 'email-verification' });
      const result = verifyPasswordResetToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });
  });

  describe('Email Verification Tokens', () => {
    it('should generate email verification token', () => {
      const token = generateEmailVerificationToken('test@example.com');

      expect(typeof token).toBe('string');

      const result = verifyEmailVerificationToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.email).toBe('test@example.com');
      expect(result.payload?.type).toBe('email-verification');
    });

    it('should verify email verification token', () => {
      const token = generateEmailVerificationToken('test@example.com');
      const result = verifyEmailVerificationToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.type).toBe('email-verification');
    });

    it('should reject email verification token with wrong type', () => {
      const token = generateToken({ userId: 'user123', type: 'password-reset' });
      const result = verifyEmailVerificationToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });
  });

  describe('Error Classes', () => {
    it('should create TokenExpiredError', () => {
      const error = new TokenExpiredError('Token expired');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TokenExpiredError');
      expect(error.message).toBe('Token expired');
    });

    it('should create InvalidTokenError', () => {
      const error = new InvalidTokenError('Invalid token');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidTokenError');
      expect(error.message).toBe('Invalid token');
    });

    it('should create MalformedTokenError', () => {
      const error = new MalformedTokenError('Malformed token');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('MalformedTokenError');
      expect(error.message).toBe('Malformed token');
    });
  });
});
