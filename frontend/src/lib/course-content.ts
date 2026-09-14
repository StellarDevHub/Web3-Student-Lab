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
  'course-1': {
    level: 'Intermediate',
    duration: '4 weeks',
    summary:
      'Master the art of writing, testing, and deploying Rust-based smart contracts on the Stellar Soroban virtual machine.',
    outcomes: [
      'Understand Soroban contract anatomy, functions, and symbols',
      'Write safe state mutations with instance and persistent storage',
      'Test contracts thoroughly using the Rust test framework and mock environments',
    ],
    modules: [
      {
        title: 'Soroban foundations',
        description: 'Build a mental model for Soroban contracts, state, and execution flow.',
      },
      {
        title: 'Writing safe contracts',
        description: 'Cover testing, auth checks, and defensive patterns for contract development.',
      },
    ],
    deliverables: ['A stateful counter and vault contract', 'A complete cargo test suite', 'Testnet deployment checklist'],
    tools: ['Rust', 'Soroban SDK', 'Stellar CLI', 'Freighter'],
  },
  'course-2': {
    level: 'Beginner',
    duration: '2 weeks',
    summary:
      'Learn the core concepts of the Stellar network: accounts, assets, trustlines, anchors, and fast transaction settlement.',
    outcomes: [
      'Create and fund Stellar accounts with public/private key pairs',
      'Establish trustlines and perform cross-asset payments',
      'Understand how Federated Byzantine Agreement achieves fast finality',
    ],
    modules: [
      {
        title: 'Stellar network basics',
        description: 'Learn how accounts, balances, and trustlines work together.',
      },
      {
        title: 'Consensus and operations',
        description: 'Explore how transactions settle and how Stellar reaches agreement.',
      },
    ],
    deliverables: ['Funded testnet account setup', 'Custom asset issuance script', 'Payment simulation walkthrough'],
    tools: ['Stellar Laboratory', 'Horizon API', 'Stellar Expert', 'Freighter'],
  },
  'course-3': {
    level: 'Intermediate',
    duration: '6 weeks',
    summary:
      'Build full-stack decentralized applications combining Next.js 16, React 19, Freighter wallet authentication, and Soroban contract RPCs.',
    outcomes: [
      'Integrate Freighter and web3 wallet connection workflows',
      'Invoke Soroban smart contract methods from React components',
      'Handle optimistic UI updates and on-chain transaction receipts',
    ],
    modules: [
      {
        title: 'Frontend foundations',
        description: 'Set up a Next.js app that can interact with web3 services safely.',
      },
      {
        title: 'Application integration',
        description: 'Connect frontend screens to backend services and contract calls.',
      },
    ],
    deliverables: ['Full-stack DApp with wallet connect', 'Interactive contract interaction panel', 'Production Vercel deployment'],
    tools: ['Next.js 16', 'React 19', 'Tailwind CSS', 'Soroban Client SDK'],
  },
  'course-4': {
    level: 'Advanced',
    duration: '5 weeks',
    summary:
      'Deep dive into WASM memory models, Rust architectural patterns, reentrancy guards, TTL rent management, and contract security auditing.',
    outcomes: [
      'Manage WASM memory layouts and optimize contract binary size',
      'Implement TTL storage extensions and rent restoration strategies',
      'Audit contracts against reentrancy, integer overflow, and auth bypasses',
    ],
    modules: [
      {
        title: 'Rust primitives for smart contracts',
        description: 'Master Rust memory management, traits, and error handling for Soroban.',
      },
      {
        title: 'Contract security architecture',
        description: 'Audit and secure contracts against reentrancy and auth bypasses.',
      },
    ],
    deliverables: ['Optimized WASM contract build', 'Security audit checklist and exploit test', 'Storage TTL keeper script'],
    tools: ['Rust', 'Soroban CLI', 'WASM Tools', 'Cargo Audit'],
  },
  'course-5': {
    level: 'Advanced',
    duration: '6 weeks',
    summary:
      'Build constant-product DEX liquidity pools, TWAP price oracles, multi-hop swaps, and atomic cross-contract arbitrage on Stellar.',
    outcomes: [
      'Implement constant product formula math with overflow-checked arithmetic',
      'Mint and burn liquidity provider (LP) tokens with fee distribution',
      'Construct manipulation-resistant TWAP oracles and flash swap mechanics',
    ],
    modules: [
      {
        title: 'DeFi mechanics & constant product AMMs',
        description: 'Learn Automated Market Maker math, liquidity pools, and swap mechanics.',
      },
      {
        title: 'Oracles and flash swaps',
        description: 'Integrate price oracles safely and execute atomic arbitrage transactions.',
      },
    ],
    deliverables: ['Constant-product AMM contract', 'TWAP oracle integration script', 'Multi-pool arbitrage simulator'],
    tools: ['Soroban SDK', 'AMM Math Models', 'Stellar DEX', 'Horizon Streamer'],
  },
  'blockchain-foundations': {
    level: 'Beginner',
    duration: '3 weeks',
    summary:
      'Understand cryptographic hashes, blocks, asymmetric key cryptography, and Federated Byzantine Agreement consensus.',
    outcomes: [
      'Implement cryptographic SHA-256 block hashing',
      'Derive Ed25519 keypairs and sign transactions',
      'Simulate Federated Byzantine Agreement quorum slice intersections',
    ],
    modules: [
      {
        title: 'Cryptographic hashes & blocks',
        description: 'Understand immutability, block headers, and cryptographic security.',
      },
      {
        title: 'Wallets, keys, and signatures',
        description: 'Asymmetric cryptography, public/private keys, and transaction signing.',
      },
      {
        title: 'The Stellar consensus protocol',
        description: 'Federated Byzantine Agreement, quorum slices, and network safety.',
      },
    ],
    deliverables: ['Block hashing implementation in Rust', 'Keypair generator structure', 'Quorum slice intersection validator'],
    tools: ['Rust Playground', 'Stellar CLI', 'Explorer Tooling'],
  },
  'smart-contracts': {
    level: 'Intermediate',
    duration: '4 weeks',
    summary:
      'Learn how programmable agreements power Web3 products with practical Soroban Rust contract exercises and tests.',
    outcomes: [
      'Write Soroban contracts with strict require_auth() access control',
      'Manage Temporary, Instance, and Persistent state storage tiers',
      'Build unit and integration tests using cargo test and mock environments',
    ],
    modules: [
      {
        title: 'Contract architecture & environment',
        description: 'Explore Soroban contract execution and WASM environments.',
      },
      {
        title: 'Persistent state & authorization',
        description: 'Persistent state storage and cryptographic signature verification.',
      },
      {
        title: 'Comprehensive testing strategies',
        description: 'Comprehensive unit testing and authorization mocking.',
      },
    ],
    deliverables: ['Calculator contract implementation', 'Vault contract with authorization', 'Complete unit test suite'],
    tools: ['Soroban SDK', 'Rust', 'Cargo Test', 'Monaco Editor'],
  },
  'open-source': {
    level: 'All Levels',
    duration: '2 weeks',
    summary:
      'Practice triaging real GitHub issues, managing Git feature branches and rebases, and submitting production-grade pull requests.',
    outcomes: [
      'Triage and write minimal reproducible bug reports',
      'Master git feature branching, rebasing, and clean history',
      'Craft semantic, production-grade pull requests with automated test coverage',
    ],
    modules: [
      {
        title: 'Triaging & reproducing issues',
        description: 'Reproducing bugs and writing minimal reproducible examples.',
      },
      {
        title: 'Advanced Git workflows',
        description: 'Clean git history, rebasing, and upstream synchronization.',
      },
      {
        title: 'The art of the pull request',
        description: 'Writing professional PRs and responding to code reviews.',
      },
    ],
    deliverables: ['Structured GitHub bug report', 'Git rebase command workflow', 'Production-grade PR description'],
    tools: ['Git CLI', 'GitHub PRs', 'Markdown', 'Monaco Diff Viewer'],
  },
  'dao-governance': {
    level: 'Advanced',
    duration: '4 weeks',
    summary:
      'Explore decentralized governance, on-chain proposals, quorum calculation, and sybil-resistant quadratic voting contracts on Stellar.',
    outcomes: [
      'Design on-chain proposal state machines with execution delays',
      'Implement quadratic voting algorithms that prevent whale dominance',
      'Deploy timelocked execution controllers for treasury management',
    ],
    modules: [
      {
        title: 'Governance primitives & state machines',
        description: 'Proposals, voting periods, quorum thresholds, and timelocks.',
      },
      {
        title: 'Quadratic voting math & Sybil resistance',
        description: 'Sybil resistance, credit allocation, and quadratic cost curves.',
      },
    ],
    deliverables: ['DAO governance contract', 'Quadratic voting tally engine', 'Timelocked executor module'],
    tools: ['Soroban SDK', 'Quadratic Voting Simulator', 'Stellar CLI'],
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

  const title = course.title?.toLowerCase() || '';

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

function resolveCourseContentKey(course: Course): string {
  if (COURSE_CONTENT[course.id]) return course.id;
  const title = course.title?.toLowerCase() || '';
  if (title.includes('soroban')) return 'cm1yxxxx-soroban';
  if (title.includes('stellar') || title.includes('web3')) return 'cm1yxxxx-intro';
  if (title.includes('defi')) return 'cm1yxxxx-defi';
  return 'default';
}

interface ModuleTranslation {
  title: string;
  description: string;
}

export function getTranslatedCourseContent(
  course: Course,
  tn: <T>(key: string) => T | undefined
): CourseContent {
  const base = getCourseContent(course);
  const key = resolveCourseContentKey(course);
  const prefix = `course.${key}`;

  const translatedLevel = tn<string>(`${prefix}.level`);
  const translatedDuration = tn<string>(`${prefix}.duration`);
  const translatedSummary = tn<string>(`${prefix}.summary`);
  const translatedOutcomes = tn<string[]>(`${prefix}.outcomes`);
  const translatedModules = tn<ModuleTranslation[]>(`${prefix}.modules`);
  const translatedDeliverables = tn<string[]>(`${prefix}.deliverables`);
  const translatedTools = tn<string[]>(`${prefix}.tools`);

  return {
    level: translatedLevel ?? base.level,
    duration: translatedDuration ?? base.duration,
    summary: translatedSummary ?? base.summary,
    outcomes: translatedOutcomes ?? base.outcomes,
    modules: translatedModules ?? base.modules,
    deliverables: translatedDeliverables ?? base.deliverables,
    tools: translatedTools ?? base.tools,
  };
}
