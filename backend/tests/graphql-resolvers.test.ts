import { describe, expect, it, jest } from '@jest/globals';

/**
 * Verifies that nested GraphQL resolvers are backed by DataLoaders so that
 * nested queries issue bounded (batched) SQL instead of N+1 queries
 * (#1424 / BE-HARD-33).
 */

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {},
  prisma: {},
}));

jest.mock('../src/cache/RedisClient.js', () => ({
  __esModule: true,
  default: { getClient: () => null },
}));

import { resolvers } from '../src/graphql/resolvers.js';

const makeContext = () => {
  const loaders = {
    studentById: { load: jest.fn((id: string) => Promise.resolve({ id })) },
    courseById: { load: jest.fn((id: string) => Promise.resolve({ id })) },
    enrollmentsByStudentId: { load: jest.fn((id: string) => Promise.resolve([{ id: `e-${id}` }])) },
    enrollmentsByCourseId: { load: jest.fn((id: string) => Promise.resolve([{ id: `e-${id}` }])) },
    certificatesByStudentId: { load: jest.fn((id: string) => Promise.resolve([{ id: `cert-${id}` }])) },
    certificatesByCourseId: { load: jest.fn(() => Promise.resolve([])) },
    learningProgressByStudentId: { load: jest.fn((id: string) => Promise.resolve([{ id: `p-${id}` }])) },
    learningProgressByCourseId: { load: jest.fn(() => Promise.resolve([])) },
  };

  return {
    context: { loaders, prisma: {}, redis: null } as any,
    loaders,
  };
};

const r = resolvers as any;

describe('GraphQL nested resolvers use DataLoaders (#1424)', () => {
  it('Student.enrollments batches by student id', async () => {
    const { context, loaders } = makeContext();

    const result = await r.Student.enrollments({ id: 's1' }, {}, context);

    expect(loaders.enrollmentsByStudentId.load).toHaveBeenCalledWith('s1');
    expect(result).toEqual([{ id: 'e-s1' }]);
  });

  it('Course.enrollments batches by course id', async () => {
    const { context, loaders } = makeContext();

    await r.Course.enrollments({ id: 'c1' }, {}, context);

    expect(loaders.enrollmentsByCourseId.load).toHaveBeenCalledWith('c1');
  });

  it('Enrollment.student and Enrollment.course use the id loaders', async () => {
    const { context, loaders } = makeContext();

    await r.Enrollment.student({ studentId: 's9' }, {}, context);
    await r.Enrollment.course({ courseId: 'c9' }, {}, context);

    expect(loaders.studentById.load).toHaveBeenCalledWith('s9');
    expect(loaders.courseById.load).toHaveBeenCalledWith('c9');
  });

  it('Certificate.student and LearningProgress.course use the id loaders', async () => {
    const { context, loaders } = makeContext();

    await r.Certificate.student({ studentId: 's2' }, {}, context);
    await r.LearningProgress.course({ courseId: 'c2' }, {}, context);

    expect(loaders.studentById.load).toHaveBeenCalledWith('s2');
    expect(loaders.courseById.load).toHaveBeenCalledWith('c2');
  });
});
