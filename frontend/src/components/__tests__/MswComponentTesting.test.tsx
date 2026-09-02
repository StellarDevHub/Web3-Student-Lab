import { describe, it, expect } from 'vitest';

describe('MSW Component Testing & Network Mocking Suite', () => {
  it('fetches courses successfully from MSW handler', async () => {
    const response = await fetch('/api/courses');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0].title).toBe('Introduction to Stellar Smart Contracts');
  });

  it('handles empty state deterministically when requested', async () => {
    const response = await fetch('/api/courses?empty=true');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('handles 500 error state deterministically without backend instance', async () => {
    const response = await fetch('/api/courses?error=500');
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Database query failed');
  });

  it('authenticates user and returns JWT token via MSW', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@web3lab.edu', password: 'password123' }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toBe('jwt-mock-token-12345');
    expect(data.user.role).toBe('STUDENT');
  });

  it('rejects invalid login with 401 Unauthorized state', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid@test.com', password: 'wrong' }),
    });
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it('verifies certificates deterministically', async () => {
    const response = await fetch('/api/certificates/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.verified).toBe(true);
    expect(data.certificate.title).toBe('Certified Soroban Developer');
  });

  it('rejects certificate verification with bad transaction hash', async () => {
    const response = await fetch('/api/certificates/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: 'invalid' }),
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.verified).toBe(false);
  });
});
