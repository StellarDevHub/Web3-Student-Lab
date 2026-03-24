'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const supertest_1 = __importDefault(require('supertest'));
const index_1 = require('../src/index');
describe('Learning Module Integration Tests', () => {
  describe('GET /api/learning/modules', () => {
    it('should return all modules', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/modules')
        .expect(200);
      expect(response.body).toHaveProperty('modules');
      expect(Array.isArray(response.body.modules)).toBe(true);
      expect(response.body.modules.length).toBeGreaterThan(0);
    });
    it('should filter modules by difficulty', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/modules?difficulty=beginner')
        .expect(200);
      expect(response.body).toHaveProperty('modules');
      // Check that all returned lessons are beginner level
      response.body.modules.forEach((module) => {
        module.lessons.forEach((lesson) => {
          expect(lesson.difficulty).toBe('beginner');
        });
      });
    });
    it('should return modules with correct structure', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/modules')
        .expect(200);
      const firstModule = response.body.modules[0];
      expect(firstModule).toHaveProperty('id');
      expect(firstModule).toHaveProperty('title');
      expect(firstModule).toHaveProperty('description');
      expect(firstModule).toHaveProperty('lessons');
      expect(Array.isArray(firstModule.lessons)).toBe(true);
    });
  });
  describe('GET /api/learning/modules/:moduleId', () => {
    it('should return a specific module by ID', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/modules/mod-1')
        .expect(200);
      expect(response.body).toHaveProperty('module');
      expect(response.body.module.id).toBe('mod-1');
      expect(response.body.module).toHaveProperty('title');
      expect(response.body.module).toHaveProperty('lessons');
    });
    it('should return 404 for non-existent module', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/modules/non-existent-id')
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
  });
  describe('GET /api/learning/progress/:userId', () => {
    it('should return default progress for new user', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/progress/new-user-123')
        .expect(200);
      expect(response.body).toHaveProperty('progress');
      expect(response.body.progress.userId).toBe('new-user-123');
      expect(response.body.progress.completedLessons).toEqual([]);
      expect(response.body.progress.percentage).toBe(0);
    });
    it('should return existing progress for user', async () => {
      // First, complete a lesson to create progress
      await (0, supertest_1.default)(index_1.app)
        .post('/api/learning/progress/existing-user/complete')
        .send({ lessonId: 'lesson-1' });
      const response = await (0, supertest_1.default)(index_1.app)
        .get('/api/learning/progress/existing-user')
        .expect(200);
      expect(response.body).toHaveProperty('progress');
      expect(response.body.progress.userId).toBe('existing-user');
      expect(response.body.progress.completedLessons).toContain('lesson-1');
    });
  });
  describe('POST /api/learning/progress/:userId/complete', () => {
    it('should mark a lesson as complete', async () => {
      const userId = 'test-user-complete';
      const lessonId = 'lesson-1';
      const response = await (0, supertest_1.default)(index_1.app)
        .post(`/api/learning/progress/${userId}/complete`)
        .send({ lessonId })
        .expect(200);
      expect(response.body).toHaveProperty('progress');
      expect(response.body.progress.completedLessons).toContain(lessonId);
      expect(response.body).toHaveProperty('message');
    });
    it('should return 400 if lesson ID is missing', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/learning/progress/test-user/complete')
        .send({})
        .expect(400);
      expect(response.body).toHaveProperty('error');
    });
    it('should return 404 for non-existent lesson', async () => {
      const response = await (0, supertest_1.default)(index_1.app)
        .post('/api/learning/progress/test-user/complete')
        .send({ lessonId: 'non-existent-lesson' })
        .expect(404);
      expect(response.body).toHaveProperty('error');
    });
    it('should update progress percentage after completing lessons', async () => {
      const userId = 'progress-user';
      // Complete first lesson
      await (0, supertest_1.default)(index_1.app)
        .post(`/api/learning/progress/${userId}/complete`)
        .send({ lessonId: 'lesson-1' });
      // Complete second lesson
      const response = await (0, supertest_1.default)(index_1.app)
        .post(`/api/learning/progress/${userId}/complete`)
        .send({ lessonId: 'lesson-2' })
        .expect(200);
      expect(response.body.progress.percentage).toBeGreaterThan(0);
    });
    it('should not duplicate completed lessons', async () => {
      const userId = 'no-duplicate-user';
      const lessonId = 'lesson-1';
      // Complete lesson twice
      await (0, supertest_1.default)(index_1.app)
        .post(`/api/learning/progress/${userId}/complete`)
        .send({ lessonId });
      const response = await (0, supertest_1.default)(index_1.app)
        .post(`/api/learning/progress/${userId}/complete`)
        .send({ lessonId })
        .expect(200);
      // Count occurrences of lesson-1
      const occurrences = response.body.progress.completedLessons.filter(
        (id) => id === lessonId
      ).length;
      expect(occurrences).toBe(1);
    });
  });
});
//# sourceMappingURL=learning.test.js.map
