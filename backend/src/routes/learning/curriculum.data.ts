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
  'course-4': [
    {
      id: 'course-4-module-1',
      title: 'Rust Primitives for Smart Contracts',
      description: 'Master Rust memory management, traits, and error handling for Soroban environment.',
      order: 1,
      lessons: [
        {
          id: 'course-4-lesson-1',
          title: 'Memory Models & Ownership in WASM',
          description: 'Understand how Rust heap allocation operates within Soroban WASM runtime.',
          difficulty: 'intermediate',
          order: 1,
        },
        {
          id: 'course-4-lesson-2',
          title: 'Custom Errors and Panic Safety',
          description: 'Implement enum-based error codes and guard against unexpected WASM aborts.',
          difficulty: 'advanced',
          order: 2,
        },
      ],
    },
    {
      id: 'course-4-module-2',
      title: 'Contract Security Architecture',
      description: 'Audit and secure contracts against reentrancy, integer overflow, and auth bypasses.',
      order: 2,
      lessons: [
        {
          id: 'course-4-lesson-3',
          title: 'Reentrancy Protections & Checks-Effects-Interactions',
          description: 'Design state updates before invoking external address calls.',
          difficulty: 'advanced',
          order: 1,
        },
        {
          id: 'course-4-lesson-4',
          title: 'TTL Storage Expiration & Rent Management',
          description: 'Manage persistent vs temporary instance storage and extend entry TTLs safely.',
          difficulty: 'advanced',
          order: 2,
        },
      ],
    },
  ],
  'course-5': [
    {
      id: 'course-5-module-1',
      title: 'DeFi Mechanics & Constant Product AMMs',
      description: 'Learn Automated Market Maker math, liquidity pools, and swap mechanics.',
      order: 1,
      lessons: [
        {
          id: 'course-5-lesson-1',
          title: 'Constant Product Formula (x * y = k)',
          description: 'Calculate slippage, pool reserves, and price impact for DEX swaps.',
          difficulty: 'intermediate',
          order: 1,
        },
        {
          id: 'course-5-lesson-2',
          title: 'Liquidity Provider Tokens & Fees',
          description: 'Mint and burn LP tokens while calculating protocol fee distributions.',
          difficulty: 'advanced',
          order: 2,
        },
      ],
    },
    {
      id: 'course-5-module-2',
      title: 'Oracles and Flash Swaps',
      description: 'Integrate price oracles safely and execute atomic arbitrage transactions.',
      order: 2,
      lessons: [
        {
          id: 'course-5-lesson-3',
          title: 'Time-Weighted Average Price (TWAP) Oracles',
          description: 'Mitigate flash loan price manipulation using historical price accumulation.',
          difficulty: 'advanced',
          order: 1,
        },
        {
          id: 'course-5-lesson-4',
          title: 'Atomic Cross-Contract Execution',
          description: 'Execute multi-step arbitrage across multiple Soroban DEX pools in a single transaction.',
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
    title: 'Soroban 101: Smart Contract Basics',
    description: 'Master the art of writing and deploying smart contracts on Stellar.',
    level: 'intermediate',
    duration: '4 weeks',
  },
  {
    id: 'course-2',
    title: 'Stellar Blockchain Fundamentals',
    description: 'Learn the core concepts of the Stellar network and its ecosystem.',
    level: 'beginner',
    duration: '2 weeks',
  },
  {
    id: 'course-3',
    title: 'DApp Development with Next.js',
    description: 'Build end-to-end decentralized applications using modern tools.',
    level: 'advanced',
    duration: '6 weeks',
  },
  {
    id: 'course-4',
    title: 'Advanced Soroban & Rust Smart Contracts',
    description: 'Deep dive into WASM memory, Rust architecture, and smart contract security.',
    level: 'advanced',
    duration: '5 weeks',
  },
  {
    id: 'course-5',
    title: 'DeFi & Automated Market Makers on Stellar',
    description: 'Build DEX liquidity pools, TWAP oracles, and atomic arbitrage bots on Stellar.',
    level: 'advanced',
    duration: '6 weeks',
  },
];
