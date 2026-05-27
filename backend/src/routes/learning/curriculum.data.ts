import { Module } from './types.js';

export const curriculumByCourseId: Record<string, Module[]> = {
  'course-1': [
    {
      id: 'course-1-module-1',
      title: 'Soroban Foundations',
      description: 'Build a mental model for Soroban contracts, state, and execution flow.',
      order: 1,
      lessons: [
        {
          id: 'course-1-lesson-1',
          title: 'What Soroban Adds to Stellar',
          description: 'Understand Soroban primitives and where they fit in the Stellar ecosystem.',
          difficulty: 'beginner',
          order: 1,
        },
        {
          id: 'course-1-lesson-2',
          title: 'Contract Structure and Storage',
          description: 'Learn contract entrypoints, storage patterns, and state transitions.',
          difficulty: 'beginner',
          order: 2,
        },
      ],
    },
    {
      id: 'course-1-module-2',
      title: 'Writing Safe Contracts',
      description: 'Cover testing, auth checks, and defensive patterns for contract development.',
      order: 2,
      lessons: [
        {
          id: 'course-1-lesson-3',
          title: 'Authorization and Access Control',
          description: 'Apply auth patterns that protect contract mutations.',
          difficulty: 'intermediate',
          order: 1,
        },
        {
          id: 'course-1-lesson-4',
          title: 'Testing Contract Logic',
          description: 'Use focused tests to verify expected smart contract behavior.',
          difficulty: 'intermediate',
          order: 2,
        },
      ],
    },
  ],
  'course-2': [
    {
      id: 'course-2-module-1',
      title: 'Stellar Network Basics',
      description: 'Learn how accounts, balances, and trustlines work together.',
      order: 1,
      lessons: [
        {
          id: 'course-2-lesson-1',
          title: 'Accounts and Assets',
          description: 'Understand account structure, balances, and asset issuance.',
          difficulty: 'beginner',
          order: 1,
        },
        {
          id: 'course-2-lesson-2',
          title: 'Trustlines and Payments',
          description: 'Follow how trustlines enable safe transfers across the network.',
          difficulty: 'beginner',
          order: 2,
        },
      ],
    },
    {
      id: 'course-2-module-2',
      title: 'Consensus and Operations',
      description: 'Explore how transactions settle and how Stellar reaches agreement.',
      order: 2,
      lessons: [
        {
          id: 'course-2-lesson-3',
          title: 'Transaction Lifecycle',
          description: 'Trace operations from submission to inclusion in the ledger.',
          difficulty: 'intermediate',
          order: 1,
        },
        {
          id: 'course-2-lesson-4',
          title: 'Stellar Consensus Protocol',
          description: 'Study the basics of SCP and why it supports fast settlement.',
          difficulty: 'intermediate',
          order: 2,
        },
      ],
    },
  ],
  'course-3': [
    {
      id: 'course-3-module-1',
      title: 'Frontend Foundations',
      description: 'Set up a Next.js app that can interact with web3 services safely.',
      order: 1,
      lessons: [
        {
          id: 'course-3-lesson-1',
          title: 'Project Structure for DApps',
          description: 'Organize frontend code, contracts, and API boundaries clearly.',
          difficulty: 'beginner',
          order: 1,
        },
        {
          id: 'course-3-lesson-2',
          title: 'Wallet and Session UX',
          description: 'Design flows for connecting wallets and handling user sessions.',
          difficulty: 'intermediate',
          order: 2,
        },
      ],
    },
    {
      id: 'course-3-module-2',
      title: 'Application Integration',
      description: 'Connect frontend screens to backend services and contract calls.',
      order: 2,
      lessons: [
        {
          id: 'course-3-lesson-3',
          title: 'Server Actions and APIs',
          description: 'Expose safe data flows between the UI and backend.',
          difficulty: 'intermediate',
          order: 1,
        },
        {
          id: 'course-3-lesson-4',
          title: 'End-to-End DApp Flow',
          description: 'Combine UI events, APIs, and contract interactions in one journey.',
          difficulty: 'advanced',
          order: 2,
        },
      ],
    },
  ],
};

export const getCurriculumForCourse = (courseId: string): Module[] => {
  return curriculumByCourseId[courseId] ?? [];
};

export const COURSES = [
  {
    id: 'course-1',
    title: 'Soroban Smart Contracts',
    description: 'Master the art of writing and deploying smart contracts on Stellar.',
    level: 'intermediate',
    duration: '4 weeks',
  },
  {
    id: 'course-2',
    title: 'Stellar Fundamentals',
    description: 'Learn the core concepts of the Stellar network and its ecosystem.',
    level: 'beginner',
    duration: '2 weeks',
  },
  {
    id: 'course-3',
    title: 'Full-Stack Web3',
    description: 'Build end-to-end decentralized applications using modern tools.',
    level: 'advanced',
    duration: '6 weeks',
  },
];
