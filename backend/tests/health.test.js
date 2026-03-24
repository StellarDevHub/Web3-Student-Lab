'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const supertest_1 = __importDefault(require('supertest'));
const index_1 = require('../src/index');
describe('Health Endpoint Integration Tests', () => {
  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await (0, supertest_1.default)(index_1.app).get(
        '/health'
      );
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    });
    it('should return Web3 Student Lab Backend message', async () => {
      const response = await (0, supertest_1.default)(index_1.app).get(
        '/health'
      );
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Web3 Student Lab Backend is running');
    });
    it('should return JSON content type', async () => {
      const response = await (0, supertest_1.default)(index_1.app).get(
        '/health'
      );
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
  describe('404 Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await (0, supertest_1.default)(index_1.app).get(
        '/non-existent-route'
      );
      expect(response.status).toBe(404);
    });
  });
});
//# sourceMappingURL=health.test.js.map
