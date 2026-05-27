import { Course } from './api';

export interface CourseContent {
  level: string;
  duration: string;
  summary: string;
  outcomes: string[];
  modules: Array<{
    title: string;
    description: string;
  }>;
  deliverables: string[];
  tools: string[];
}

const COURSE_CONTENT: Record<string, CourseContent> = {
  'cm1yxxxx-intro': {
    level: 'Beginner',
    duration: '3 weeks',
    summary:
      'Build a clear mental model of wallets, ledgers, assets, consensus, and the role Stellar plays in practical Web3 systems.',
    outcomes: [
      'Explain how blockchain networks reach consensus and record state changes',
      'Understand Stellar accounts, assets, trustlines, and payments',
      'Navigate wallets, transactions, and explorer tooling confidently',
    ],
    modules: [
      {
        title: 'Web3 foundations',
        description: 'The shift from centralized systems to open, shared infrastructure.',
      },
      {
        title: 'Stellar network primitives',
        description: 'Accounts, balances, assets, trustlines, and transaction flow.',
      },
      {
        title: 'Hands-on network operations',
        description: 'Use wallets, inspect transactions, and simulate real payment scenarios.',
      },
    ],
    deliverables: [
      'A short ecosystem explainer',
      'A wallet setup and funding walkthrough',
      'A basic Stellar transaction demo',
    ],
    tools: ['Freighter', 'Stellar Expert', 'Testnet faucet', 'Explorer tooling'],
  },
  'cm1yxxxx-soroban': {
    level: 'Intermediate',
    duration: '5 weeks',
    summary:
      'Learn how to build secure Soroban smart contracts in Rust, test them properly, and deploy them with confidence.',
    outcomes: [
      'Understand Soroban contract structure and storage patterns',
      'Write contract logic with clear state transitions and validations',
      'Test and deploy Rust-based contracts to the Stellar testnet',
    ],
    modules: [
      {
        title: 'Soroban architecture',
        description: 'How contracts execute, store data, and interact with transactions.',
      },
      {
        title: 'Rust contract patterns',
        description: 'Functions, storage, auth, and defensive design for smart contracts.',
      },
      {
        title: 'Testing and deployment',
        description: 'Run local tests, simulate scenarios, and publish to testnet.',
      },
    ],
    deliverables: [
      'A simple stateful contract',
      'A test suite covering success and failure cases',
      'A testnet deployment checklist',
    ],
    tools: ['Rust', 'Soroban SDK', 'Stellar CLI', 'Testnet RPC'],
  },
  'cm1yxxxx-defi': {
    level: 'Intermediate',
    duration: '4 weeks',
    summary:
      'Explore how DeFi systems are composed, from liquidity pools and AMMs to incentives and risk management.',
    outcomes: [
      'Describe how AMMs and liquidity pools price assets',
      'Evaluate the risks behind yield, volatility, and slippage',
      'Design basic token flows for lending, swaps, or rewards',
    ],
    modules: [
      {
        title: 'DeFi building blocks',
        description: 'Pools, LP tokens, swaps, routing, and fee mechanics.',
      },
      {
        title: 'Tokenomics and incentives',
        description: 'How protocols align participation, rewards, and governance.',
      },
      {
        title: 'Risk analysis',
        description: 'Impermanent loss, smart contract risk, and system-level tradeoffs.',
      },
    ],
    deliverables: [
      'A DeFi protocol teardown',
      'A token-flow diagram',
      'A simple AMM math exercise',
    ],
    tools: ['AMM simulators', 'Spreadsheet modeling', 'Protocol dashboards', 'Explorer tooling'],
  },
};

const DEFAULT_CONTENT: CourseContent = {
  level: 'Open level',
  duration: '4 weeks',
  summary:
    'This module is ready for enrollment, but its structured curriculum metadata has not been fully published yet.',
  outcomes: [
    'Understand the main concepts covered by the module',
    'Practice with hands-on labs and guided exercises',
    'Finish with a project or assessment tied to the module theme',
  ],
  modules: [
    {
      title: 'Core concepts',
      description: 'Learn the vocabulary, mental models, and system basics first.',
    },
    {
      title: 'Hands-on practice',
      description: 'Work through applied exercises and implementation walkthroughs.',
    },
    {
      title: 'Project wrap-up',
      description: 'Bring the pieces together in a final output or review checkpoint.',
    },
  ],
  deliverables: ['Notes and checkpoints', 'Hands-on lab work', 'Final review artifact'],
  tools: ['Wallet tooling', 'Explorer tools', 'Course exercises'],
};

export function getCourseContent(course: Course): CourseContent {
  if (COURSE_CONTENT[course.id]) {
    return COURSE_CONTENT[course.id];
  }

  const title = course.title.toLowerCase();

  if (title.includes('soroban')) {
    return COURSE_CONTENT['cm1yxxxx-soroban'];
  }

  if (title.includes('stellar') || title.includes('web3')) {
    return COURSE_CONTENT['cm1yxxxx-intro'];
  }

  if (title.includes('defi')) {
    return COURSE_CONTENT['cm1yxxxx-defi'];
  }

  return {
    ...DEFAULT_CONTENT,
    summary: course.description || DEFAULT_CONTENT.summary,
  };
}
