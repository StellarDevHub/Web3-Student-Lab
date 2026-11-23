import request from 'supertest';
import prisma from '../src/db/index.js';
import { app } from '../src/index.js';
import {
  buildCurriculumSearchQuery,
  buildIndexEntries,
} from '../src/search/curriculum/curriculumSearchQuery.js';
import { collectIndexEntries } from '../src/search/curriculum/CurriculumSearchService.js';
import type { Module } from '../src/routes/learning/types.js';

const sampleCurriculum: Record<string, Module[]> = {
  'course-1': [
    {
      id: 'm1',
      title: 'Soroban Foundations',
      description: 'Mental model for contracts.',
      order: 1,
      lessons: [
        {
          id: 'l1',
          title: 'What Soroban Adds',
          description: 'Primitives overview.',
          difficulty: 'beginner',
          order: 1,
        },
      ],
    },
  ],
};

describe('curriculum search — pure builders', () => {
  describe('buildIndexEntries', () => {
    it('flattens courses, modules and lessons into rows', () => {
      const entries = buildIndexEntries(
        [{ id: 'course-1', title: 'Soroban Smart Contracts', description: 'Master contracts.' }],
        sampleCurriculum
      );

      // 1 course + 1 module + 1 lesson
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.entityType)).toEqual(['course', 'module', 'lesson']);

      const lesson = entries.find((e) => e.entityType === 'lesson');
      expect(lesson?.entityId).toBe('l1');
      expect(lesson?.courseId).toBe('course-1');
      expect(lesson?.difficulty).toBe('beginner');
      expect(lesson?.content).toBe('What Soroban Adds Primitives overview.');
    });

    it('handles courses without curriculum', () => {
      const entries = buildIndexEntries([{ id: 'c9', title: 'Lonely', description: null }], {});
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ entityType: 'course', entityId: 'c9', content: 'Lonely' });
    });
  });

  describe('buildCurriculumSearchQuery', () => {
    it('binds query + workspace and omits absent filters', () => {
      const { text, values } = buildCurriculumSearchQuery({
        query: 'soroban',
        workspaceId: 'default',
        limit: 20,
        offset: 0,
      });
      expect(values).toEqual(['soroban', 'default', 20, 0]);
      expect(text).toContain("websearch_to_tsquery('english', $1)");
      expect(text).toContain('"workspaceId" = $2');
      expect(text).not.toContain('"entityType"');
      expect(text).toContain('LIMIT $3 OFFSET $4');
      expect(text).toContain('ORDER BY rank DESC, "title" ASC, "id" ASC');
    });

    it('appends type, difficulty and courseId filters in order', () => {
      const { text, values } = buildCurriculumSearchQuery({
        query: 'auth',
        workspaceId: 'w1',
        entityType: 'lesson',
        difficulty: 'beginner',
        courseId: 'course-1',
        limit: 10,
        offset: 5,
      });
      expect(values).toEqual(['auth', 'w1', 'lesson', 'beginner', 'course-1', 10, 5]);
      expect(text).toContain('"entityType" = $3');
      expect(text).toContain('"difficulty" = $4');
      expect(text).toContain('"courseId" = $5');
      expect(text).toContain('LIMIT $6 OFFSET $7');
    });

    it('adds a stable cursor filter when provided', () => {
      const { text, values } = buildCurriculumSearchQuery({
        query: 'soroban',
        workspaceId: 'default',
        limit: 10,
        offset: 0,
        cursor: { rank: 0.42, title: 'Alpha', id: 'abc' },
      });

      expect(values).toEqual(['soroban', 'default', 0.42, 'Alpha', 'abc', 10, 0]);
      expect(text).toContain('ts_rank("searchVector", websearch_to_tsquery');
      expect(text).toContain('OR (ts_rank("searchVector"');
      expect(text).toContain('AND "title" > $4');
    });
  });

  describe('collectIndexEntries', () => {
    it('indexes static modules/lessons and deduplicates DB courses', () => {
      // DB course collides with a static course id — static entry should win.
      const entries = collectIndexEntries([
        { id: 'course-1', title: 'DB Title', description: 'db' },
        { id: 'db-only', title: 'Fresh Course', description: 'new' },
      ]);

      const courseOnes = entries.filter(
        (e) => e.entityType === 'course' && e.entityId === 'course-1'
      );
      expect(courseOnes).toHaveLength(1);
      expect(courseOnes[0].title).not.toBe('DB Title'); // static wins on dedupe

      expect(entries.some((e) => e.entityType === 'lesson')).toBe(true);
      expect(entries.some((e) => e.entityId === 'db-only')).toBe(true);
    });
  });
});

describe('GET /api/v1/search (integration)', () => {
  let canRun = false;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      // Verify the search index table exists (migration applied).
      await (prisma as any).$queryRawUnsafe('SELECT 1 FROM "curriculum_search_entries" LIMIT 1');
      await request(app).post('/api/v1/search/reindex').expect(200);
      canRun = true;
    } catch {
      console.warn('Search index/database unavailable — skipping integration tests');
    }
  });

  afterAll(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  });

  it('returns 400 when q is missing', async () => {
    if (!canRun) return;
    await request(app).get('/api/v1/search').expect(400);
  });

  it('returns ranked lessons/modules for a keyword', async () => {
    if (!canRun) return;
    const res = await request(app).get('/api/v1/search').query({ q: 'soroban' }).expect(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('filters by type', async () => {
    if (!canRun) return;
    const res = await request(app)
      .get('/api/v1/search')
      .query({ q: 'contract', type: 'lesson' })
      .expect(200);
    expect(res.body.results.every((r: { entityType: string }) => r.entityType === 'lesson')).toBe(
      true
    );
  });
});
