import { redactSensitiveData } from '../src/utils/logSanitizer.js';

describe('redactSensitiveData', () => {
  it('should mask email addresses as u***@domain.com', () => {
    expect(redactSensitiveData('user@example.com')).toBe('u***@example.com');
    expect(redactSensitiveData('admin@sub.domain.org')).toBe('a***@sub.domain.org');
    expect(redactSensitiveData('a@b.c')).toBe('a***@b.c');
  });

  it('should mask credit card numbers keeping last 4 digits', () => {
    expect(redactSensitiveData('4111-1111-1111-1234')).toBe('****-****-****-1234');
    expect(redactSensitiveData('4111111111111234')).toBe('****-****-****-1234');
    expect(redactSensitiveData('4111 1111 1111 1234')).toBe('****-****-****-1234');
  });

  it('should redact sensitive keys', () => {
    const input = {
      password: 'secret123',
      Authorization: 'Bearer abc',
      apiKey: 'key-123',
      privateKey: '0xabcdef',
      token: 'tok_xyz',
    };
    const result = redactSensitiveData(input) as Record<string, unknown>;
    expect(result.password).toBe('[REDACTED]');
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
  });

  it('should redact case-insensitive sensitive keys', () => {
    const input = {
      Password: 'secret123',
      AUTHORIZATION: 'Bearer abc',
      ApiKey: 'key-123',
    };
    const result = redactSensitiveData(input) as Record<string, unknown>;
    expect(result.Password).toBe('[REDACTED]');
    expect(result.AUTHORIZATION).toBe('[REDACTED]');
    expect(result.ApiKey).toBe('[REDACTED]');
  });

  it('should recursively redact nested objects', () => {
    const input = {
      user: {
        email: 'admin@example.com',
        credentials: {
          password: 'hunter2',
          token: 'tok_abc',
        },
      },
      meta: {
        cards: ['4111-1111-1111-1234', '5500-0000-0000-0004'],
      },
    };
    const result = redactSensitiveData(input) as Record<string, unknown>;
    expect((result.user as Record<string, unknown>).email).toBe('a***@example.com');
    expect((result.user.credentials as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result.user.credentials as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((result.meta as Record<string, unknown>).cards).toEqual([
      '****-****-****-1234',
      '****-****-****-0004',
    ]);
  });

  it('should handle arrays', () => {
    const input = [
      'user@example.com',
      { password: 'secret' },
      '4111-1111-1111-1234',
    ];
    const result = redactSensitiveData(input) as unknown[];
    expect(result[0]).toBe('u***@example.com');
    expect((result[1] as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(result[2]).toBe('****-****-****-1234');
  });

  it('should preserve non-sensitive values', () => {
    const input = {
      name: 'Alice',
      count: 42,
      active: true,
      nested: {
        id: '123',
        role: 'admin',
      },
    };
    expect(redactSensitiveData(input)).toEqual(input);
  });

  it('should handle null and undefined', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
  });

  it('should handle plain strings that are not emails or cards', () => {
    expect(redactSensitiveData('hello world')).toBe('hello world');
    expect(redactSensitiveData('123')).toBe('123');
  });
});
