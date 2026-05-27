import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';

// Check if database is available before running tests
let dbAvailable = false;
beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch (_error) {
    console.warn('Database not available, skipping auth tests');
  }
});

const describeOrSkip = dbAvailable ? describe : describe.skip;

describeOrSkip('Auth Module Integration Tests', () => {
  // Clean up database before each test
  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.student.deleteMany();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new student successfully', async () => {
      const newStudent = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(newStudent)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(newStudent.email);
      expect(response.body.user.name).toBe(`${newStudent.firstName} ${newStudent.lastName}`);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should return 400 if fields are missing', async () => {
      const incompleteStudent = {
        email: 'test2@example.com',
        // missing password, firstName, and lastName
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(incompleteStudent)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if password is too short', async () => {
      const newStudent = {
        email: 'test3@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(newStudent)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 if student already exists', async () => {
      const newStudent = {
        email: 'duplicate@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      // First registration
      await request(app).post('/api/v1/auth/register').send(newStudent).expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(newStudent)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Student with this email already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const testStudent = {
      email: 'login@example.com',
      password: 'password123',
      firstName: 'Login',
      lastName: 'Test',
    };

    beforeEach(async () => {
      // Register student before each login test
      await request(app).post('/api/v1/auth/register').send(testStudent);
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testStudent.email,
          password: testStudent.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testStudent.email);
      expect(response.body.user.name).toBe(`${testStudent.firstName} ${testStudent.lastName}`);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should return 400 if email or password is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testStudent.email })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testStudent.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent student', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let authToken: string;
    const testStudent = {
      email: 'me@example.com',
      password: 'password123',
      firstName: 'Me',
      lastName: 'Test',
    };

    beforeEach(async () => {
      // Register and login to get a valid token
      const registerResponse = await request(app).post('/api/v1/auth/register').send(testStudent);
      authToken = registerResponse.body.token;
    });

    it('should return 401 without authorization header', async () => {
      const response = await request(app).get('/api/v1/auth/me').expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 with invalid token format', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return student data with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(testStudent.email);
      expect(response.body.user.name).toBe(`${testStudent.firstName} ${testStudent.lastName}`);
    });
  });
});
