import { describe, expect, it, jest } from '@jest/globals';
import { createLoaders } from '../src/graphql/loaders.js';

/**
 * DataLoader batching tests (#1424 / BE-HARD-33). These assert that nested
 * relation lookups collapse into a bounded number of `findMany` calls rather
 * than N+1 per-row queries.
 */

const createMockPrisma = () => {
  const studentFindMany = jest.fn<any>();
  const courseFindMany = jest.fn<any>();
  const enrollmentFindMany = jest.fn<any>();
  const certificateFindMany = jest.fn<any>();
  const learningProgressFindMany = jest.fn<any>();

  return {
    prisma: {
      student: { findMany: studentFindMany },
      course: { findMany: courseFindMany },
      enrollment: { findMany: enrollmentFindMany },
      certificate: { findMany: certificateFindMany },
      learningProgress: { findMany: learningProgressFindMany },
    } as any,
    studentFindMany,
    courseFindMany,
    enrollmentFindMany,
    certificateFindMany,
    learningProgressFindMany,
  };
};

describe('GraphQL DataLoaders (#1424)', () => {
  it('batches many student lookups into a single query', async () => {
    const m = createMockPrisma();
    m.studentFindMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    const loaders = createLoaders(m.prisma);

    const [a, b, missing] = await Promise.all([
      loaders.studentById.load('s1'),
      loaders.studentById.load('s2'),
      loaders.studentById.load('missing'),
    ]);

    expect(m.studentFindMany).toHaveBeenCalledTimes(1);
    expect(m.studentFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1', 's2', 'missing'] } },
    });
    expect(a).toEqual({ id: 's1' });
    expect(b).toEqual({ id: 's2' });
    expect(missing).toBeNull();
  });

  it('dedupes repeated keys via the per-request cache', async () => {
    const m = createMockPrisma();
    m.courseFindMany.mockResolvedValue([{ id: 'c1', title: 'Course 1' }]);
    const loaders = createLoaders(m.prisma);

    const first = await loaders.courseById.load('c1');
    const second = await loaders.courseById.load('c1');

    expect(m.courseFindMany).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('groups a one-to-many relation by foreign key in one query', async () => {
    const m = createMockPrisma();
    m.enrollmentFindMany.mockResolvedValue([
      { id: 'e1', studentId: 's1' },
      { id: 'e2', studentId: 's1' },
      { id: 'e3', studentId: 's2' },
    ]);
    const loaders = createLoaders(m.prisma);

    const [s1, s2] = await Promise.all([
      loaders.enrollmentsByStudentId.load('s1'),
      loaders.enrollmentsByStudentId.load('s2'),
    ]);

    expect(m.enrollmentFindMany).toHaveBeenCalledTimes(1);
    expect(m.enrollmentFindMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['s1', 's2'] } },
    });
    expect(s1.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(s2.map((e) => e.id)).toEqual(['e3']);
  });

  it('returns an empty array for keys with no matching rows', async () => {
    const m = createMockPrisma();
    m.certificateFindMany.mockResolvedValue([{ id: 'cert1', courseId: 'c1' }]);
    const loaders = createLoaders(m.prisma);

    const [hit, miss] = await Promise.all([
      loaders.certificatesByCourseId.load('c1'),
      loaders.certificatesByCourseId.load('c2'),
    ]);

    expect(m.certificateFindMany).toHaveBeenCalledTimes(1);
    expect(hit.map((c) => c.id)).toEqual(['cert1']);
    expect(miss).toEqual([]);
  });
});
