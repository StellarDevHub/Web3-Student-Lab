import { getStudentAchievements } from '../blockchain/blockchain.service.js';
import prisma from '../db/index.js';
import { getStudentProgress } from '../routes/learning/learning.service.js';
import { getTokenBalance } from '../token/token.service.js';
import { Achievement, StudentDashboard, TokenBalance } from './types.js';

/**
 * Service to aggregate student profile data from multiple modules.
 * This service provides a centralized dashboard of achievements and rewards.
 */
export const getStudentDashboard = async (studentId: string): Promise<StudentDashboard> => {
  // Fetch primary student info and some database records for baseline verification
  let student;
  try {
    student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        certificates: true,
        enrollments: {
          orderBy: {
            enrolledAt: 'asc',
          },
          take: 1,
        },
      },
    });
  } catch {
    console.warn(`Database unreachable for student ${studentId}, using mock profile`);
  }

  if (!student) {
    // Return a mock dashboard for development/connection testing
    return {
      userId: studentId,
      progress: {
        id: 'mock-progress-1',
        studentId,
        courseId: 'course-1',
        completedLessons: ['lesson-1', 'lesson-2'],
        currentModuleId: 'mod-2',
        percentage: 45,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      certificates: [
        {
          id: 'cert-mock-1',
          title: 'Web3 Fundamentals',
          description: 'On-chain verified: 0x123...abc',
          date: new Date(),
          type: 'certificate',
          hash: '0x1234567890abcdef',
          did: 'did:soroban:testnet:demo-student#certificate',
        },
      ],
      tokenBalance: {
        symbol: 'W3SL',
        balance: 50.5,
        lastUpdated: new Date(),
      },
      recentActivity: [
        'Joined Web3 Student Lab',
        'Completed Web3 Fundamentals',
        'Earned 50 W3SL tokens',
      ],
      studentDid: 'did:soroban:testnet:demo-student#certificate',
    };
  }

  // Unified Student Profile View across modules
  const enrolledCourseId = student.enrollments[0]?.courseId ?? 'course-1';
  const [learningProgress, blockchainAchievements, tokenWallet] = await Promise.all([
    getStudentProgress(studentId, enrolledCourseId),
    getStudentAchievements(studentId),
    getTokenBalance(studentId),
  ]);

  // Transform data for the Unified 'Student Profile' view
  const certificates: Achievement[] = blockchainAchievements.map((achievement) => ({
    id: achievement.id,
    title: `Student Achievement: Certified Level ${achievement.status === 'verified' ? 'verified' : 'pending'}`,
    description:
      achievement.status === 'verified'
        ? `On-chain verified: ${achievement.txHash.substring(0, 10)}...`
        : 'Awaiting blockchain verification',
    date: achievement.timestamp,
    type: 'certificate',
    hash: achievement.txHash,
    did: student.did ?? null,
  }));

  const tokenBalance: TokenBalance = {
    symbol: tokenWallet.symbol,
    balance: tokenWallet.balance,
    lastUpdated: tokenWallet.lastUpdated,
  };

  // Aggregated Activity Logging
  const recentActivity = [`Joined Web3 Student Lab on ${student.createdAt.toLocaleDateString()}`];

  if (learningProgress && learningProgress.completedLessons.length > 0) {
    recentActivity.push(`Completed ${learningProgress.completedLessons.length} lessons`);
  }

  if (blockchainAchievements.length > 0) {
    recentActivity.push(`Earned ${blockchainAchievements.length} verified certificates`);
  }

  return {
    userId: studentId,
    progress: learningProgress ?? {
      id: '',
      studentId,
      courseId: enrolledCourseId,
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    certificates,
    tokenBalance,
    recentActivity,
    studentDid: student.did ?? null,
  };
};

/**
 * Service to get global platform statistics.
 * Includes a resilient fallback if the database is unreachable.
 */
export const getStats = async () => {
  try {
    const [coursesCount, studentsCount, certificatesCount] = await Promise.all([
      prisma.course.count(),
      prisma.student.count(),
      prisma.certificate.count(),
    ]);

    return {
      coursesCount,
      studentsCount,
      certificatesCount,
      verificationRate: '100%',
    };
  } catch {
    console.warn('Database unreachable, returning mock dashboard stats');
    // Mock statistical data for 'Connection' verification
    return {
      coursesCount: 12,
      studentsCount: 1250,
      certificatesCount: 450,
      verificationRate: '98% Verified',
    };
  }
};
