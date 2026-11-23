import express from 'express';
import request from 'supertest';
import prisma from '../src/db/index.js';
import oauthRouter from '../src/routes/oauth.routes.js';
import {
  generateState,
  createOAuthState,
  validateOAuthState,
  buildAuthorizationUrl,
  findOrCreateStudentByGitHub,
} from '../src/auth/github.service.js';

// Check if database is available before running tests
let dbAvailable = false;
beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch (_error) {
    console.warn('Database not available, skipping GitHub OAuth tests');
  }
});

const describeOrSkip = dbAvailable ? describe : describe.skip;

// Helper to create an Express app with the OAuth router
const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/oauth', oauthRouter);
  return app;
};

describe('GitHub OAuth - Unit Tests', () => {
  describe('generateState', () => {
    it('should generate a 64-character hex string', () => {
      const state = generateState();
      expect(state).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(state)).toBe(true);
    });

    it('should generate unique states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('should return a valid GitHub OAuth URL with state', () => {
      const state = generateState();
      const url = buildAuthorizationUrl(state);

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=');
      expect(url).toContain('read:user');
      expect(url).toContain('user:email');
    });
  });
});

describeOrSkip('GitHub OAuth - State Management', () => {
  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.oAuthState.deleteMany();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await prisma.oAuthState.deleteMany();
  });

  describe('createOAuthState', () => {
    it('should create and return a valid state string', async () => {
      const state = await createOAuthState();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBe(64);

      // Verify it was stored in the database
      const storedState = await prisma.oAuthState.findUnique({
        where: { state },
      });
      expect(storedState).not.toBeNull();
      expect(storedState!.provider).toBe('github');
      expect(storedState!.usedAt).toBeNull();
    });

    it('should set an expiration date in the future', async () => {
      const state = await createOAuthState();
      const storedState = await prisma.oAuthState.findUnique({
        where: { state },
      });

      expect(storedState!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('validateOAuthState', () => {
    it('should return true for a valid unused state', async () => {
      const state = await createOAuthState();
      const isValid = await validateOAuthState(state);
      expect(isValid).toBe(true);
    });

    it('should return false for a non-existent state', async () => {
      const isValid = await validateOAuthState('nonexistent-state');
      expect(isValid).toBe(false);
    });

    it('should return false for a reused state (replay prevention)', async () => {
      const state = await createOAuthState();

      // First use - should be valid
      const firstUse = await validateOAuthState(state);
      expect(firstUse).toBe(true);

      // Second use - should be invalid (replay prevention)
      const secondUse = await validateOAuthState(state);
      expect(secondUse).toBe(false);
    });

    it('should return false for an empty string', async () => {
      const isValid = await validateOAuthState('');
      expect(isValid).toBe(false);
    });
  });
});

describe('GitHub OAuth - API Route Validation (no DB required)', () => {
  describe('GET /api/v1/oauth/github/callback', () => {
    it('should return 400 when code is missing', async () => {
      const app = createApp();

      const response = await request(app)
        .get('/api/v1/oauth/github/callback')
        .query({ state: 'test-state' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Authorization code is required');
    });

    it('should return 400 when state is missing', async () => {
      const app = createApp();

      const response = await request(app)
        .get('/api/v1/oauth/github/callback')
        .query({ code: 'test-code' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('State parameter is required');
    });
  });

  describe('POST /api/v1/oauth/github/callback', () => {
    it('should return 400 when code is missing', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/v1/oauth/github/callback')
        .send({ state: 'test-state' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Authorization code is required');
    });

    it('should return 400 when state is missing', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/v1/oauth/github/callback')
        .send({ code: 'test-code' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('State parameter is required');
    });
  });
});

describeOrSkip('GitHub OAuth - API Routes (DB required)', () => {
  describe('GET /api/v1/oauth/github', () => {
    it('should redirect to GitHub authorization URL', async () => {
      const app = createApp();

      const response = await request(app)
        .get('/api/v1/oauth/github')
        .expect(302);

      expect(response.headers.location).toContain('https://github.com/login/oauth/authorize');
      expect(response.headers.location).toContain('client_id=');
      expect(response.headers.location).toContain('state=');
      expect(response.headers.location).toContain('redirect_uri=');
      expect(response.headers.location).toContain('scope=');
    });

    it('should contain read:user and user:email in scope', async () => {
      const app = createApp();

      const response = await request(app)
        .get('/api/v1/oauth/github')
        .expect(302);

      const location = response.headers.location;
      const params = new URLSearchParams(location.split('?')[1]);
      const scope = params.get('scope');

      expect(scope).toContain('read:user');
      expect(scope).toContain('user:email');
    });
  });

  describe('GET /api/v1/oauth/github/callback with invalid state', () => {
    it('should redirect with error when state is invalid', async () => {
      const app = createApp();

      const response = await request(app)
        .get('/api/v1/oauth/github/callback')
        .query({ code: 'test-code', state: 'invalid-state' })
        .expect(302);

      const location = response.headers.location;
      expect(location).toContain('/auth/login?error=');
      expect(decodeURIComponent(location)).toContain('Invalid or expired OAuth state');
    });
  });

  describe('POST /api/v1/oauth/github/callback with invalid state', () => {
    it('should return 401 when state is invalid', async () => {
      const app = createApp();

      const response = await request(app)
        .post('/api/v1/oauth/github/callback')
        .send({ code: 'test-code', state: 'invalid-state' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});

describeOrSkip('GitHub OAuth - Account Linking (Integration)', () => {
  afterAll(async () => {
    if (!dbAvailable) return;
    // Clean up test students created during tests
    await prisma.student.deleteMany({
      where: {
        email: { contains: '@github.oauth' },
      },
    });
    await prisma.oAuthState.deleteMany();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    // Clean up test students created during tests
    await prisma.student.deleteMany({
      where: {
        email: { contains: '@github.oauth' },
      },
    });
    await prisma.oAuthState.deleteMany();
  });

  describe('findOrCreateStudentByGitHub', () => {
    it('should create a new student from GitHub user data', async () => {
      const githubUser = {
        id: 12345,
        login: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        name: 'Test User',
        email: null,
        node_id: 'MDQ6VXNlcjEyMzQ1',
      };

      const { student, isNewUser } = await findOrCreateStudentByGitHub(
        githubUser,
        'mock-access-token'
      );

      expect(student).toBeDefined();
      expect(student.githubId).toBe(12345);
      expect(student.githubUsername).toBe('testuser');
      expect(student.githubAvatarUrl).toBe('https://avatars.githubusercontent.com/u/12345');
      expect(student.firstName).toBe('Test');
      expect(student.lastName).toBe('User');
      expect(isNewUser).toBe(true);
    });

    it('should find existing student by githubId', async () => {
      const githubUser = {
        id: 54321,
        login: 'existinguser',
        avatar_url: 'https://avatars.githubusercontent.com/u/54321',
        name: 'Existing User',
        email: null,
        node_id: 'MDQ6VXNlcjU0MzIx',
      };

      // Create the student first
      const { student: created } = await findOrCreateStudentByGitHub(
        githubUser,
        'mock-access-token'
      );

      // Try to find/create again - should find existing
      const { student, isNewUser } = await findOrCreateStudentByGitHub(
        { ...githubUser, name: 'Updated Name' },
        'new-access-token'
      );

      expect(student.id).toBe(created.id);
      expect(isNewUser).toBe(false);
      // Should have updated fields
      expect(student.githubUsername).toBe('existinguser');
    });

    it('should handle users without a full name', async () => {
      const githubUser = {
        id: 99999,
        login: 'nameless',
        avatar_url: 'https://avatars.githubusercontent.com/u/99999',
        name: null,
        email: null,
        node_id: 'MDQ6VXNlcjk5OTk5',
      };

      const { student, isNewUser } = await findOrCreateStudentByGitHub(
        githubUser,
        'mock-access-token'
      );

      expect(student).toBeDefined();
      expect(student.githubId).toBe(99999);
      expect(student.githubUsername).toBe('nameless');
      expect(student.firstName).toBe('nameless');
      expect(student.lastName).toBe('User');
      expect(isNewUser).toBe(true);
    });
  });
});
