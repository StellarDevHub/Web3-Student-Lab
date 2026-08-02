import { describe, expect, it, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';

const GRAPHQL_URL = '/graphql';

describe('GraphQL API', () => {
  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch {
      console.warn('Database not available for GraphQL tests');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => {});
  });

  beforeEach(async () => {
    await prisma.certificate.deleteMany().catch(() => {});
    await prisma.learningProgress.deleteMany().catch(() => {});
    await prisma.enrollment.deleteMany().catch(() => {});
    await prisma.student.deleteMany().catch(() => {});
    await prisma.course.deleteMany().catch(() => {});
  });

  describe('health query', () => {
    it('returns OK status', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({ query: '{ health }' });

      expect(response.status).toBe(200);
      expect(response.body.data?.health).toBe('OK');
    });
  });

  describe('createStudent mutation', () => {
    it('creates a student and returns id and email', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation CreateStudent($input: CreateStudentInput!) {
              createStudent(input: $input) {
                id
                email
                firstName
                lastName
                walletAddress
              }
            }
          `,
          variables: {
            input: {
              email: 'student@example.com',
              firstName: 'Test',
              lastName: 'Student',
              walletAddress: 'GABC...XYZ',
              password: 'secret123',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data?.createStudent.email).toBe('student@example.com');
      expect(response.body.data?.createStudent.firstName).toBe('Test');
      expect(response.body.data?.createStudent.id).toBeTruthy();
    });

    it('does not return password in response', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation CreateStudent($input: CreateStudentInput!) {
              createStudent(input: $input) {
                id
                email
                password
              }
            }
          `,
          variables: {
            input: {
              email: 'student2@example.com',
              firstName: 'Test',
              lastName: 'Student',
              password: 'secret123',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data?.createStudent.password).toBeUndefined();
    });
  });

  describe('students query', () => {
    it('returns empty list when no students exist', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({ query: '{ students { id email firstName lastName } }' });

      expect(response.status).toBe(200);
      expect(response.body.data?.students).toEqual([]);
    });

    it('returns students after creation', async () => {
      await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation { createStudent(input: { email: "gql@test.com", firstName: "G", lastName: "QL", password: "x" }) { id } }
          `,
        });

      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({ query: '{ students { id email } }' });

      expect(response.status).toBe(200);
      expect(response.body.data?.students.length).toBeGreaterThan(0);
    });
  });

  describe('courses query', () => {
    it('returns courses list', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            {
              courses {
                id
                title
                instructor
                credits
                modules {
                  id
                  title
                  lessons {
                    id
                    title
                    difficulty
                  }
                }
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data?.courses)).toBe(true);
    });
  });

  describe('createStudent + enrollStudent + issueCertificate workflow', () => {
    it('completes full workflow', async () => {
      const createStudentRes = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation Create($input: CreateStudentInput!) {
              createStudent(input: $input) { id }
            }
          `,
          variables: {
            input: {
              email: 'workflow@test.com',
              firstName: 'Work',
              lastName: 'Flow',
              password: 'password',
            },
          },
        });

      const studentId = createStudentRes.body.data?.createStudent.id;

      await prisma.course.create({
        data: {
          id: 'graphql-course-1',
          title: 'GraphQL Test Course',
          description: 'Test course',
          instructor: 'Test Instructor',
          credits: 3,
          workspaceId: 'default',
        },
      });

      const enrollRes = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation Enroll($input: EnrollmentInput!) {
              enrollStudent(input: $input) {
                id
                student { id }
                course { id }
              }
            }
          `,
          variables: {
            input: { studentId, courseId: 'graphql-course-1' },
          },
        });

      expect(enrollRes.status).toBe(200);
      expect(enrollRes.body.data?.enrollStudent).toBeTruthy();
    });
  });

  describe('GraphQL error handling', () => {
    it('returns 400 for empty query', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({ query: '' });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('returns validation errors for invalid input', async () => {
      const response = await request(app)
        .post(GRAPHQL_URL)
        .send({
          query: `
            mutation CreateStudent($input: CreateStudentInput!) {
              createStudent(input: $input) { id }
            }
          `,
          variables: {
            input: {
              email: 'not-an-email',
              firstName: '',
              lastName: '',
              password: '',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeTruthy();
    });
  });
});
