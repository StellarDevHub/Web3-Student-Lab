/** @type {import('ts-jest').JestConfigWithTsJest} */
process.env.NODE_ENV = 'test';

export default {
  setupFiles: [
    'dotenv/config',
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/jest.setup.ts',
  ],
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    'tests/audit-system.test.ts',
    'tests/curriculum.unit.test.ts',
    'tests/user.test.ts',
    'tests/certificates.test.ts',
    'tests/hash-demo.test.ts',
    'tests/learning.test.ts',
    'tests/learning.content.test.ts',
    'tests/chain-indexer-engine.test.ts',
    'tests/feedback.test.ts',
    'tests/curriculum-search.test.ts',
    'tests/db.health.test.ts',
    'tests/graphql.test.ts',
    'tests/simulator.test.ts',
    'tests/progress.unit.test.ts',
    'tests/infrastructure.test.ts',
    'tests/webhooks.routes.test.ts',
    'tests/vesting.test.ts',
    'tests/auth.test.ts',
    'tests/certificates.api.test.ts',
    'tests/github-oauth.test.ts',
    'tests/audit.test.ts',
    'tests/workspaceIsolation.test.ts',
    'tests/curriculum-progress.integration.test.ts',
    'tests/notification-preferences.test.ts',
    'tests/webhooks-osct.test.ts',
    'tests/oauth.integration.test.ts',
    'tests/generator.service.test.ts',
    'tests/gas-estimation.test.ts',
    'tests/generator.websocket.test.ts',
    'tests/generator.rate-limit.test.ts'
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
