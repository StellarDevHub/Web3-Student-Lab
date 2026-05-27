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
    console.warn('Database not available, skipping feedback tests');
  }
});

const describeOrSkip = dbAvailable ? describe : describe.skip;

describeOrSkip('Feedback Module Integration Tests', () => {
  let authToken: string;
  let studentId: string;
  let courseId: string;

  // Clean up database before each test
  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.feedback.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.student.deleteMany();
    await prisma.course.deleteMany();

    // Create a test student
    const studentResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'Student',
    });

    authToken = studentResponse.body.token;
    studentId = studentResponse.body.user.id;

    // Create a test course
    const course = await prisma.course.create({
      data: {
        title: 'Test Course',
        description: 'A test course',
        instructor: 'Test Instructor',
        credits: 3,
      },
    });
    courseId = course.id;

    // Enroll the student in the course
    await prisma.enrollment.create({
      data: {
        studentId,
        courseId,
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  describe('POST /api/v1/feedback', () => {
    it('should submit feedback for a course successfully', async () => {
      const feedbackData = {
        courseId,
        rating: 5,
        review: 'Excellent course!',
      };

      const response = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send(feedbackData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.studentId).toBe(studentId);
      expect(response.body.courseId).toBe(courseId);
      expect(response.body.rating).toBe(5);
      expect(response.body.review).toBe('Excellent course!');
      expect(response.body).toHaveProperty('student');
    });

    it('should return 400 if courseId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 5 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if rating is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 6 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 if student is not enrolled in the course', async () => {
      // Create another course without enrollment
      const otherCourse = await prisma.course.create({
        data: {
          title: 'Other Course',
          description: 'Another course',
          instructor: 'Other Instructor',
          credits: 3,
        },
      });

      const response = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId: otherCourse.id, rating: 4 })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ courseId, rating: 5 })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/feedback/course/:courseId', () => {
    beforeEach(async () => {
      // Create some feedback
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 5, review: 'Great!' });
    });

    it('should fetch all feedback for a course', async () => {
      const response = await request(app).get(`/api/v1/feedback/course/${courseId}`).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].rating).toBe(5);
      expect(response.body[0].review).toBe('Great!');
    });

    it('should return 404 for non-existent course', async () => {
      const response = await request(app)
        .get('/api/v1/feedback/course/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/feedback/course/:courseId/summary', () => {
    beforeEach(async () => {
      // Create feedback with different ratings
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 5 });
    });

    it('should return rating summary for a course', async () => {
      const response = await request(app)
        .get(`/api/v1/feedback/course/${courseId}/summary`)
        .expect(200);

      expect(response.body).toHaveProperty('courseId', courseId);
      expect(response.body).toHaveProperty('averageRating');
      expect(response.body).toHaveProperty('totalReviews', 1);
      expect(response.body).toHaveProperty('ratingDistribution');
      expect(response.body.ratingDistribution).toHaveProperty('5', 1);
    });
  });

  describe('GET /api/v1/feedback/my-feedback/:courseId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 4, review: 'Good course' });
    });

    it('should get current user feedback for a course', async () => {
      const response = await request(app)
        .get(`/api/v1/feedback/my-feedback/${courseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.rating).toBe(4);
      expect(response.body.review).toBe('Good course');
    });

    it('should return 404 if feedback does not exist', async () => {
      // Create another course and enroll
      const otherCourse = await prisma.course.create({
        data: {
          title: 'Other Course',
          description: 'Description',
          instructor: 'Instructor',
          credits: 3,
        },
      });

      await prisma.enrollment.create({
        data: {
          studentId,
          courseId: otherCourse.id,
          status: 'active',
        },
      });

      const response = await request(app)
        .get(`/api/v1/feedback/my-feedback/${otherCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/feedback/:courseId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 3, review: 'Okay' });
    });

    it('should update existing feedback', async () => {
      const response = await request(app)
        .put(`/api/v1/feedback/${courseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 4, review: 'Better than I thought' })
        .expect(200);

      expect(response.body.rating).toBe(4);
      expect(response.body.review).toBe('Better than I thought');
    });

    it('should return 404 if feedback does not exist', async () => {
      // Create another course and enroll without feedback
      const otherCourse = await prisma.course.create({
        data: {
          title: 'No Feedback Course',
          description: 'Description',
          instructor: 'Instructor',
          credits: 3,
        },
      });

      await prisma.enrollment.create({
        data: {
          studentId,
          courseId: otherCourse.id,
          status: 'active',
        },
      });

      const response = await request(app)
        .put(`/api/v1/feedback/${otherCourse.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 5 })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/feedback/:courseId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ courseId, rating: 5 });
    });

    it('should delete feedback', async () => {
      await request(app)
        .delete(`/api/v1/feedback/${courseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deletion
      const response = await request(app)
        .get(`/api/v1/feedback/my-feedback/${courseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if feedback does not exist', async () => {
      const response = await request(app)
        .delete('/api/v1/feedback/non-existent-course')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });
});
