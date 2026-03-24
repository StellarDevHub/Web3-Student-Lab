'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const supertest_1 = __importDefault(require('supertest'));
const index_1 = require('../src/index');
describe('Auth Module Integration Tests', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(newUser.email);
      expect(response.body.user.name).toBe(newUser.name);
      expect(response.body).toHaveProperty('token');
    });
    it('should return 400 if fields are missing', async () => {
      const incompleteUser = {
        email: 'test2@example.com',
        // missing password and name
      };
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(incompleteUser)
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 400 if password is too short', async () => {
      const newUser = {
        email: 'test3@example.com',
        password: '123',
        name: 'Test User',
      };
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 409 if user already exists', async () => {
      const newUser = {
        email: 'duplicate@example.com',
        password: 'password123',
        name: 'Test User',
      };
      // First registration
      await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);
      // Second registration with same email
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(409);
      expect(response.body).toHaveProperty('error');
    });
  });
  describe('POST /api/auth/login', () => {
    const testUser = {
      email: 'login@example.com',
      password: 'password123',
      name: 'Login Test User',
    };
    beforeAll(async () => {
      // Register user before login tests
      await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/register')
        .send(testUser);
    });
    it('should login successfully with valid credentials', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body).toHaveProperty('token');
    });
    it('should return 400 if email or password is missing', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/login')
        .send({ email: testUser.email })
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 401 for invalid credentials', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 401 for non-existent user', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);
      expect(response.body).toHaveProperty('error');
    });
  });
  describe('GET /api/auth/me', () => {
    it('should return 401 without authorization header', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/auth/me')
        .expect(401);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 401 with invalid token format', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      expect(response.body).toHaveProperty('error');
    });
    it('should return user data with valid token', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer mock-jwt-token-user-123')
        .expect(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('name');
    });
  });
});
//# sourceMappingURL=auth.test.js.map
