import crypto from 'node:crypto';
import redisClient from '../cache/RedisClient.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import type { GraphQLContext } from './context.js';

const CACHE_TTL = 60;

async function getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const client = redisClient.getClient();
  if (!client) return fetcher();

  const cached = await client.get(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const result = await fetcher();
  await client.setex(key, CACHE_TTL, JSON.stringify(result));
  return result;
}

export const resolvers = {
  Query: {
    students: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const cacheKey = 'graphql:students';
      return getCached(cacheKey, () =>
        prisma.student.findMany({
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            walletAddress: true,
            did: true,
            createdAt: true,
          },
        })
      );
    },

    student: async (_parent: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const cacheKey = `graphql:student:${id}`;
      return getCached(cacheKey, () =>
        prisma.student.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            walletAddress: true,
            did: true,
            createdAt: true,
          },
        })
      );
    },

    courses: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const cacheKey = 'graphql:courses';
      return getCached(cacheKey, () =>
        prisma.course.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            instructor: true,
            credits: true,
            createdAt: true,
          },
        })
      );
    },

    course: async (_parent: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const cacheKey = `graphql:course:${id}`;
      return getCached(cacheKey, () =>
        prisma.course.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            description: true,
            instructor: true,
            credits: true,
            createdAt: true,
          },
        })
      );
    },

    enrollments: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return prisma.enrollment.findMany({
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },

    certificates: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return prisma.certificate.findMany({
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },

    learningProgress: async (_parent: unknown, { studentId, courseId }: { studentId: string; courseId: string }, context: GraphQLContext) => {
      return prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: { studentId, courseId },
        },
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },

    health: async () => {
      return 'OK';
    },
  },

  Mutation: {
    createStudent: async (_parent: unknown, { input }: { input: { email: string; firstName: string; lastName: string; walletAddress?: string; password: string } }, context: GraphQLContext) => {
      const hashedPassword = crypto.createHash('sha256').update(input.password).digest('hex');

      const student = await prisma.student.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          walletAddress: input.walletAddress,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          walletAddress: true,
          did: true,
          createdAt: true,
        },
      });

      const client = redisClient.getClient();
      if (client) await client.del('graphql:students');
      logger.info('GraphQL: student created', { studentId: student.id });
      return student;
    },

    enrollStudent: async (_parent: unknown, { input }: { input: { studentId: string; courseId: string } }, context: GraphQLContext) => {
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: input.studentId,
          courseId: input.courseId,
        },
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });

      const client = redisClient.getClient();
      if (client) await client.del('graphql:enrollments');
      logger.info('GraphQL: student enrolled', {
        studentId: input.studentId,
        courseId: input.courseId,
      });
      return enrollment;
    },

    updateLearningProgress: async (_parent: unknown, { input }: { input: { studentId: string; courseId: string; lessonId: string; status: string } }, context: GraphQLContext) => {
      const existing = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: input.studentId,
            courseId: input.courseId,
          },
        },
      });

      const completedLessonsArray = existing ? (Array.isArray(existing.completedLessons) ? existing.completedLessons as string[] : []) : [];
      const completedLessons = Array.from(new Set([...completedLessonsArray, input.lessonId]));

      const percentage = Math.min(100, completedLessons.length * 10);

      const progress = await prisma.learningProgress.upsert({
        where: {
          studentId_courseId: {
            studentId: input.studentId,
            courseId: input.courseId,
          },
        },
        update: {
          completedLessons,
          percentage,
          status: input.status,
        },
        create: {
          studentId: input.studentId,
          courseId: input.courseId,
          completedLessons,
          percentage,
          status: input.status,
        },
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });

      const cacheKey = `graphql:progress:${input.studentId}:${input.courseId}`;
      const client = redisClient.getClient();
      if (client) await client.del(cacheKey);
      logger.info('GraphQL: learning progress updated', {
        studentId: input.studentId,
        courseId: input.courseId,
      });
      return progress;
    },

    issueCertificate: async (_parent: unknown, { studentId, courseId }: { studentId: string; courseId: string }, context: GraphQLContext) => {
      const tokenId = `token-${crypto.randomUUID()}`;
      const certificate = await prisma.certificate.create({
        data: {
          studentId,
          courseId,
          tokenId,
          status: 'MINTED',
          issuedAt: new Date(),
        },
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });

      const client = redisClient.getClient();
      if (client) await client.del('graphql:certificates');
      logger.info('GraphQL: certificate issued', {
        certificateId: certificate.id,
        studentId,
        courseId,
      });
      return certificate;
    },
  },

  Student: {
    enrollments: async (parent: { id: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.enrollment.findMany({
        where: { studentId: parent.id },
        include: {
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },
    certificates: async (parent: { id: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.certificate.findMany({
        where: { studentId: parent.id },
        include: {
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },
    learningProgress: async (parent: { id: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.learningProgress.findMany({
        where: { studentId: parent.id },
        include: {
          course: {
            select: { id: true, title: true, instructor: true, credits: true },
          },
        },
      });
    },
  },

  Course: {
    enrollments: async (parent: { id: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.enrollment.findMany({
        where: { courseId: parent.id },
        include: {
          student: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    },
    modules: async (parent: { id: string }, _args: unknown, context: GraphQLContext) => {
      const cacheKey = `graphql:modules:${parent.id}`;
      const client = redisClient.getClient();
      if (client) {
        const cached = await client.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      const result = await prisma.course.findUnique({
        where: { id: parent.id },
        select: { id: true, title: true, description: true },
      });

      const modules = [
        {
          id: `${parent.id}-module-1`,
          title: 'Introduction',
          description: result?.description || 'Course introduction',
          lessons: [
            {
              id: `${parent.id}-lesson-1`,
              title: 'Welcome',
              content: 'Welcome to the course',
              difficulty: 'beginner',
              completed: false,
            },
          ],
        },
      ];

      if (client) await client.setex(cacheKey, CACHE_TTL, JSON.stringify(modules));
      return modules;
    },
  },

  Enrollment: {
    student: async (parent: { studentId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.student.findUnique({
        where: { id: parent.studentId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
    },
    course: async (parent: { courseId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.course.findUnique({
        where: { id: parent.courseId },
        select: { id: true, title: true, instructor: true, credits: true },
      });
    },
  },

  Certificate: {
    student: async (parent: { studentId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.student.findUnique({
        where: { id: parent.studentId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
    },
    course: async (parent: { courseId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.course.findUnique({
        where: { id: parent.courseId },
        select: { id: true, title: true, instructor: true, credits: true },
      });
    },
  },

  LearningProgress: {
    student: async (parent: { studentId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.student.findUnique({
        where: { id: parent.studentId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
    },
    course: async (parent: { courseId: string }, _args: unknown, context: GraphQLContext) => {
      return prisma.course.findUnique({
        where: { id: parent.courseId },
        select: { id: true, title: true, instructor: true, credits: true },
      });
    },
  },
};
