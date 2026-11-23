import { Course } from './api';

export interface LearningTask {
  id: string;
  title: string;
  type: 'watch' | 'read' | 'build' | 'quiz';
  duration: string;
}

export interface LearningResource {
  title: string;
  type: 'video' | 'guide' | 'lab';
  duration: string;
  href: string;
}

export interface LearningLevel {
  id: string;
  title: string;
  summary: string;
  goal: string;
  tasks: LearningTask[];
  resources: LearningResource[];
}

export interface CourseLearningJourney {
  headline: string;
  levelLabel: string;
  streakMessage: string;
  levels: LearningLevel[];
}

const STORAGE_KEY = 'admin_learning_journeys';

const DEFAULT_JOURNEYS: Record<string, CourseLearningJourney> = {
  'cm1yxxxx-intro': {
    headline: 'Build your mental model of Web3 before you start shipping.',
    levelLabel: 'Explorer Track',
    streakMessage: 'Small daily sessions are enough here. Consistency matters more than speed.',
    levels: [
      {
        id: 'intro-level-1',
        title: 'Level 1: Foundations',
        summary: 'Understand ledgers, wallets, transactions, and the Stellar network model.',
        goal: 'Be able to explain how value moves on Stellar and what a learner needs to operate safely.',
        tasks: [
          {
            id: 'intro-1-watch',
            title: 'Watch the Web3 foundations overview',
            type: 'watch',
            duration: '12 min',
          },
          {
            id: 'intro-1-read',
            title: 'Read the Stellar network primitives guide',
            type: 'read',
            duration: '15 min',
          },
          {
            id: 'intro-1-quiz',
            title: 'Complete the quick concepts checkpoint',
            type: 'quiz',
            duration: '8 min',
          },
        ],
        resources: [
          {
            title: 'Intro video: What makes Stellar different?',
            type: 'video',
            duration: '12 min',
            href: 'https://developers.stellar.org/docs/learn/fundamentals',
          },
          {
            title: 'Guide: Accounts, assets, and trustlines',
            type: 'guide',
            duration: '15 min',
            href: 'https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts',
          },
          {
            title: 'Lab: Inspect a real transaction',
            type: 'lab',
            duration: '20 min',
            href: 'https://stellar.expert/explorer/public',
          },
        ],
      },
      {
        id: 'intro-level-2',
        title: 'Level 2: Network Practice',
        summary: 'Use wallet and explorer tooling to understand how actions appear on-chain.',
        goal: 'Move from theory to tool fluency.',
        tasks: [
          {
            id: 'intro-2-watch',
            title: 'Watch a wallet setup walkthrough',
            type: 'watch',
            duration: '10 min',
          },
          {
            id: 'intro-2-build',
            title: 'Fund a test wallet and record the steps',
            type: 'build',
            duration: '25 min',
          },
          {
            id: 'intro-2-read',
            title: 'Review common transaction mistakes',
            type: 'read',
            duration: '10 min',
          },
        ],
        resources: [
          {
            title: 'Guide: Wallet setup checklist',
            type: 'guide',
            duration: '10 min',
            href: 'https://developers.stellar.org/docs/tools/wallets',
          },
          {
            title: 'Lab: Use the Stellar testnet faucet',
            type: 'lab',
            duration: '25 min',
            href: 'https://laboratory.stellar.org/#account-creator?network=test',
          },
          {
            title: 'Guide: Reading explorer output',
            type: 'guide',
            duration: '10 min',
            href: 'https://stellar.expert/explorer/public',
          },
        ],
      },
      {
        id: 'intro-level-3',
        title: 'Level 3: Applied Flow',
        summary:
          'Use what you learned to document and explain a realistic learner transaction flow.',
        goal: 'Be ready to help another beginner move from setup to a successful testnet action.',
        tasks: [
          {
            id: 'intro-3-build',
            title: 'Create a beginner setup checklist',
            type: 'build',
            duration: '20 min',
          },
          {
            id: 'intro-3-watch',
            title: 'Watch a sample transaction walkthrough',
            type: 'watch',
            duration: '9 min',
          },
          {
            id: 'intro-3-quiz',
            title: 'Complete the readiness checkpoint',
            type: 'quiz',
            duration: '10 min',
          },
        ],
        resources: [
          {
            title: 'Video: End-to-end beginner flow',
            type: 'video',
            duration: '9 min',
            href: 'https://developers.stellar.org/docs/learn/fundamentals',
          },
          {
            title: 'Guide: Beginner-friendly transaction checklist',
            type: 'guide',
            duration: '12 min',
            href: 'https://developers.stellar.org/docs/tools/wallets',
          },
          {
            title: 'Lab: Document one complete testnet flow',
            type: 'lab',
            duration: '20 min',
            href: 'https://stellar.expert/explorer/public',
          },
        ],
      },
    ],
  },
  'cm1yxxxx-soroban': {
    headline: 'Go from Rust basics to deployable Soroban contracts one level at a time.',
    levelLabel: 'Builder Track',
    streakMessage: 'Treat this like gym reps for smart contracts: short daily practice wins.',
    levels: [
      {
        id: 'soroban-level-1',
        title: 'Level 1: Contract Basics',
        summary: 'Learn the shape of a Soroban contract and how state is stored and updated.',
        goal: 'Understand contract structure well enough to read and explain a simple example.',
        tasks: [
          {
            id: 'soroban-1-watch',
            title: 'Watch a Soroban contract walkthrough',
            type: 'watch',
            duration: '18 min',
          },
          {
            id: 'soroban-1-read',
            title: 'Read the contract lifecycle notes',
            type: 'read',
            duration: '15 min',
          },
          {
            id: 'soroban-1-build',
            title: 'Trace a simple storage update by hand',
            type: 'build',
            duration: '20 min',
          },
        ],
        resources: [
          {
            title: 'Video: Soroban contract anatomy',
            type: 'video',
            duration: '18 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/getting-started',
          },
          {
            title: 'Guide: Soroban storage and auth',
            type: 'guide',
            duration: '15 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/example-contracts',
          },
          {
            title: 'Lab: Run the getting-started example',
            type: 'lab',
            duration: '20 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup',
          },
        ],
      },
      {
        id: 'soroban-level-2',
        title: 'Level 2: Testing and Safety',
        summary: 'Practice writing safer contracts and testing both success and failure paths.',
        goal: 'Be comfortable thinking about auth, validation, and test coverage.',
        tasks: [
          {
            id: 'soroban-2-read',
            title: 'Read the secure contract checklist',
            type: 'read',
            duration: '12 min',
          },
          {
            id: 'soroban-2-build',
            title: 'Write two failure-case tests',
            type: 'build',
            duration: '30 min',
          },
          {
            id: 'soroban-2-quiz',
            title: 'Answer the contract safety checkpoint',
            type: 'quiz',
            duration: '10 min',
          },
        ],
        resources: [
          {
            title: 'Guide: Contract safety checklist',
            type: 'guide',
            duration: '12 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/example-contracts',
          },
          {
            title: 'Lab: Add tests to a simple contract',
            type: 'lab',
            duration: '30 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/getting-started/testing',
          },
          {
            title: 'Video: Common smart contract mistakes',
            type: 'video',
            duration: '14 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts',
          },
        ],
      },
      {
        id: 'soroban-level-3',
        title: 'Level 3: Deployment Path',
        summary: 'Prepare a contract for testnet deployment and verification.',
        goal: 'Reach the point where you can ship a small contract and explain the steps.',
        tasks: [
          {
            id: 'soroban-3-watch',
            title: 'Watch a testnet deployment walkthrough',
            type: 'watch',
            duration: '15 min',
          },
          {
            id: 'soroban-3-build',
            title: 'Run your deployment checklist',
            type: 'build',
            duration: '25 min',
          },
          {
            id: 'soroban-3-read',
            title: 'Review post-deploy verification steps',
            type: 'read',
            duration: '8 min',
          },
        ],
        resources: [
          {
            title: 'Guide: Deploy to testnet',
            type: 'guide',
            duration: '15 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/getting-started/deploy-to-testnet',
          },
          {
            title: 'Lab: Contract deployment checklist',
            type: 'lab',
            duration: '25 min',
            href: 'https://developers.stellar.org/docs/build/smart-contracts/getting-started/deploy-to-testnet',
          },
          {
            title: 'Guide: Verify and inspect deployed contracts',
            type: 'guide',
            duration: '8 min',
            href: 'https://developers.stellar.org/docs/tools',
          },
        ],
      },
    ],
  },
  'cm1yxxxx-defi': {
    headline: 'Learn how DeFi systems work by breaking pools, incentives, and risk into levels.',
    levelLabel: 'Strategist Track',
    streakMessage: 'Focus on understanding tradeoffs, not just memorizing definitions.',
    levels: [
      {
        id: 'defi-level-1',
        title: 'Level 1: Primitives',
        summary: 'Understand pools, swaps, liquidity providers, and fee mechanics.',
        goal: 'Describe how liquidity and swaps work in plain language.',
        tasks: [
          {
            id: 'defi-1-watch',
            title: 'Watch the AMM basics lesson',
            type: 'watch',
            duration: '16 min',
          },
          {
            id: 'defi-1-read',
            title: 'Read the liquidity provider notes',
            type: 'read',
            duration: '12 min',
          },
          {
            id: 'defi-1-quiz',
            title: 'Take the DeFi primitives checkpoint',
            type: 'quiz',
            duration: '8 min',
          },
        ],
        resources: [
          {
            title: 'Video: AMM fundamentals',
            type: 'video',
            duration: '16 min',
            href: 'https://uniswap.org/whitepaper-v3.pdf',
          },
          {
            title: 'Guide: LP mechanics in practice',
            type: 'guide',
            duration: '12 min',
            href: 'https://docs.uniswap.org/concepts/protocol/overview',
          },
          {
            title: 'Lab: Simulate a pool trade',
            type: 'lab',
            duration: '20 min',
            href: 'https://app.uniswap.org/',
          },
        ],
      },
      {
        id: 'defi-level-2',
        title: 'Level 2: Incentives and Risk',
        summary: 'Learn how token incentives attract users and what can go wrong.',
        goal: 'Recognize tradeoffs in yield, volatility, and protocol design.',
        tasks: [
          {
            id: 'defi-2-read',
            title: 'Read the impermanent loss explainer',
            type: 'read',
            duration: '14 min',
          },
          {
            id: 'defi-2-build',
            title: 'Map one protocol incentive loop',
            type: 'build',
            duration: '18 min',
          },
          {
            id: 'defi-2-watch',
            title: 'Watch the protocol risk breakdown',
            type: 'watch',
            duration: '11 min',
          },
        ],
        resources: [
          {
            title: 'Guide: Protocol incentive design',
            type: 'guide',
            duration: '14 min',
            href: 'https://docs.uniswap.org/concepts/protocol/fees',
          },
          {
            title: 'Lab: Token flow mapping exercise',
            type: 'lab',
            duration: '18 min',
            href: 'https://app.uniswap.org/',
          },
          {
            title: 'Video: Risk patterns in DeFi',
            type: 'video',
            duration: '11 min',
            href: 'https://ethereum.org/en/defi/',
          },
        ],
      },
      {
        id: 'defi-level-3',
        title: 'Level 3: Strategy Review',
        summary: 'Turn protocol knowledge into decision-making and evaluation skills.',
        goal: 'Be able to compare two DeFi systems and explain the key tradeoffs clearly.',
        tasks: [
          {
            id: 'defi-3-build',
            title: 'Compare two protocol designs',
            type: 'build',
            duration: '20 min',
          },
          {
            id: 'defi-3-read',
            title: 'Review governance and incentive notes',
            type: 'read',
            duration: '12 min',
          },
          {
            id: 'defi-3-quiz',
            title: 'Finish the strategy checkpoint',
            type: 'quiz',
            duration: '10 min',
          },
        ],
        resources: [
          {
            title: 'Guide: Comparing DeFi protocols',
            type: 'guide',
            duration: '12 min',
            href: 'https://docs.uniswap.org/concepts/uniswap-protocol',
          },
          {
            title: 'Lab: Protocol comparison worksheet',
            type: 'lab',
            duration: '20 min',
            href: 'https://app.uniswap.org/',
          },
          {
            title: 'Video: Governance and incentive review',
            type: 'video',
            duration: '10 min',
            href: 'https://ethereum.org/en/defi/',
          },
        ],
      },
    ],
  },
};

const DEFAULT_JOURNEY: CourseLearningJourney = {
  headline:
    'A structured path is available for this module, even if the full curriculum is still growing.',
  levelLabel: 'Core Track',
  streakMessage: 'Show up daily, finish one task, and let momentum do the heavy lifting.',
  levels: [
    {
      id: 'default-level-1',
      title: 'Level 1: Orientation',
      summary: 'Start with the core concepts and context you need for the module.',
      goal: 'Understand what this course covers and how to move through it.',
      tasks: [
        {
          id: 'default-watch',
          title: 'Watch the orientation lesson',
          type: 'watch',
          duration: '10 min',
        },
        {
          id: 'default-read',
          title: 'Read the guided notes',
          type: 'read',
          duration: '12 min',
        },
        {
          id: 'default-build',
          title: 'Complete the starter exercise',
          type: 'build',
          duration: '20 min',
        },
      ],
      resources: [
        {
          title: 'Orientation video',
          type: 'video',
          duration: '10 min',
          href: '/courses',
        },
        {
          title: 'Guided notes',
          type: 'guide',
          duration: '12 min',
          href: '/courses',
        },
        {
          title: 'Starter lab',
          type: 'lab',
          duration: '20 min',
          href: '/playground',
        },
      ],
    },
  ],
};

function readJourneyOverrides(): Record<string, CourseLearningJourney> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CourseLearningJourney>) : {};
  } catch {
    return {};
  }
}

export function saveLearningJourney(courseId: string, journey: CourseLearningJourney) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = readJourneyOverrides();
  current[courseId] = journey;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function getStoredLearningJourney(courseId: string): CourseLearningJourney | null {
  const current = readJourneyOverrides();
  return current[courseId] || null;
}

export function createJourneyTemplate(course: Course): CourseLearningJourney {
  return {
    headline: `Build confidence in ${course.title} one level at a time.`,
    levelLabel: 'Custom Track',
    streakMessage: 'Give learners one clear next step every day.',
    levels: [
      {
        id: `${course.id}-level-1`,
        title: 'Level 1: Getting Started',
        summary: 'Introduce the learner to the module and its first practical concepts.',
        goal: 'Help the learner understand the basics and complete the first small win.',
        tasks: [
          {
            id: `${course.id}-task-1`,
            title: 'Watch the first lesson',
            type: 'watch',
            duration: '10 min',
          },
          {
            id: `${course.id}-task-2`,
            title: 'Read the module notes',
            type: 'read',
            duration: '12 min',
          },
        ],
        resources: [
          {
            title: 'Intro video',
            type: 'video',
            duration: '10 min',
            href: '/courses',
          },
          {
            title: 'Intro guide',
            type: 'guide',
            duration: '12 min',
            href: '/courses',
          },
        ],
      },
    ],
  };
}

export function getLearningJourney(course: Course): CourseLearningJourney {
  const stored = getStoredLearningJourney(course.id);
  if (stored) {
    return stored;
  }

  if (DEFAULT_JOURNEYS[course.id]) {
    return DEFAULT_JOURNEYS[course.id];
  }

  const title = course.title.toLowerCase();

  if (title.includes('soroban')) {
    return DEFAULT_JOURNEYS['cm1yxxxx-soroban'];
  }

  if (title.includes('defi')) {
    return DEFAULT_JOURNEYS['cm1yxxxx-defi'];
  }

  if (title.includes('stellar') || title.includes('web3')) {
    return DEFAULT_JOURNEYS['cm1yxxxx-intro'];
  }

  return DEFAULT_JOURNEY;
}
