export type CommandCategory =
  | 'courses'
  | 'contracts'
  | 'simulators'
  | 'tools'
  | 'addresses'
  | 'docs'
  | 'templates'
  | 'actions';

export interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: CommandCategory;
  keywords?: string[];
  href?: string;
  /** Soroban testnet contract id (C… address) when applicable. */
  address?: string;
  action?: () => void;
}

export interface RouteDef {
  title: string;
  href: string;
  description: string;
  category: CommandCategory;
  keywords?: string[];
}

/**
 * Canonical registry of navigable routes in the app (50+).
 */
export const NAV_ROUTES: RouteDef[] = [
  {
    title: 'Home',
    href: '/',
    description: 'Landing page and platform overview',
    category: 'courses',
    keywords: ['home', 'landing', 'start'],
  },
  {
    title: 'Course Catalog',
    href: '/courses',
    description: 'Browse guided learning modules and beginner tracks',
    category: 'courses',
    keywords: ['learn', 'catalog', 'modules'],
  },
  {
    title: 'Learning Roadmap',
    href: '/roadmap',
    description: 'Step-by-step path from beginner to builder',
    category: 'courses',
    keywords: ['roadmap', 'path', 'graph', 'timeline'],
  },
  {
    title: 'Lessons',
    href: '/lessons',
    description: 'Lesson listing across all courses',
    category: 'courses',
    keywords: ['lessons', 'curriculum'],
  },
  {
    title: 'Enroll',
    href: '/enroll',
    description: 'Multi-step enrollment wizard with wallet check',
    category: 'courses',
    keywords: ['enroll', 'signup', 'wizard'],
  },
  {
    title: 'Quiz Engine',
    href: '/quiz',
    description: 'Interactive quizzes with instant feedback',
    category: 'courses',
    keywords: ['quiz', 'test', 'assessment'],
  },
  {
    title: 'Peer Review',
    href: '/peer-review',
    description: 'Review classmate submissions and earn reputation',
    category: 'courses',
    keywords: ['peer', 'review'],
  },
  {
    title: 'Peer Review (New)',
    href: '/peer-review-new',
    description: 'Redesigned peer-review flow',
    category: 'courses',
    keywords: ['peer', 'review', 'new'],
  },
  {
    title: 'Code Snippets',
    href: '/snippets',
    description: 'Reusable Soroban and Stellar code snippet library',
    category: 'courses',
    keywords: ['snippets', 'code', 'library', 'soroban', 'rust'],
  },
  {
    title: 'Video Learning',
    href: '/video',
    description: 'Video learning module',
    category: 'courses',
    keywords: ['video', 'tutorials'],
  },
  {
    title: 'Bookmarks',
    href: '/bookmarks',
    description: 'Saved courses, lessons, and tools',
    category: 'courses',
    keywords: ['bookmarks', 'saved'],
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    description: 'Progress, enrollments, and credentials',
    category: 'courses',
    keywords: ['dashboard', 'progress'],
  },
  {
    title: 'Brainstorm Canvas',
    href: '/brainstorm',
    description: 'Collaborative brainstorm canvas for hackathons',
    category: 'courses',
    keywords: ['brainstorm', 'ideas', 'canvas'],
  },
  {
    title: 'Blockchain Simulator',
    href: '/simulator',
    description: 'Create transactions, mine blocks, inspect hashes',
    category: 'simulators',
    keywords: ['blockchain', 'simulator', 'mining', 'blocks', 'hash'],
  },
  {
    title: 'Block Scanner',
    href: '/simulator/scanner',
    description: 'Scan simulated blocks and transactions',
    category: 'simulators',
    keywords: ['scanner', 'blocks', 'explorer'],
  },
  {
    title: 'Cryptography Visualizer',
    href: '/simulator/crypto',
    description: 'Interactive SHA-256, Ed25519, and ECDSA explorer',
    category: 'simulators',
    keywords: ['sha256', 'hash', 'ed25519', 'ecdsa', 'crypto', 'soroban'],
  },
  {
    title: 'Chain Explorer',
    href: '/simulator/explorer',
    description: 'Explore the simulated chain tip and mempool',
    category: 'simulators',
    keywords: ['explorer', 'chain', 'blocks'],
  },
  {
    title: 'Consensus Simulator',
    href: '/consensus-simulator',
    description: 'Federated agreement and quorum slice playground',
    category: 'simulators',
    keywords: ['consensus', 'quorum', 'scp'],
  },
  {
    title: 'Stellar Consensus Protocol',
    href: '/stellar-consensus-protocol',
    description: 'SCP / Federated Byzantine Agreement visualizer',
    category: 'simulators',
    keywords: ['scp', 'stellar', 'consensus', 'federated'],
  },
  {
    title: 'Merkle Proof Studio',
    href: '/merkle-tree',
    description: 'Interactive Merkle-tree builder with SHA-256 proofs',
    category: 'simulators',
    keywords: ['merkle', 'tree', 'proofs', 'hash', 'simulator', 'studio', 'inclusion'],
  },
  {
    title: 'Chain Reorg Visualizer',
    href: '/chain-reorg',
    description: 'Visualize forks and chain reorganizations',
    category: 'simulators',
    keywords: ['reorg', 'fork', 'chain'],
  },
  {
    title: 'Mempool Fee Auction',
    href: '/mempool-auction',
    description: 'Live mempool sorted by fee bids',
    category: 'simulators',
    keywords: ['mempool', 'gas', 'auction', 'fees'],
  },
  {
    title: 'Quadratic Funding Sim',
    href: '/quadratic-funding-sim',
    description: 'Simulate matching grants and voting math',
    category: 'simulators',
    keywords: ['quadratic', 'funding', 'grants', 'matching'],
  },
  {
    title: 'Storage Model Explorer',
    href: '/storage-model',
    description: 'Soroban storage, TTL, and footprint visualizer',
    category: 'simulators',
    keywords: ['storage', 'ttl', 'soroban', 'footprint'],
  },
  {
    title: 'XDR Inspector',
    href: '/xdr-inspector',
    description: 'Decode Stellar XDR envelopes and transactions',
    category: 'simulators',
    keywords: ['xdr', 'decode', 'transaction', 'stellar'],
  },
  {
    title: 'WASM Analyzer',
    href: '/wasm-analyzer',
    description: 'Inspect Soroban WASM size and imports',
    category: 'simulators',
    keywords: ['wasm', 'size', 'soroban', 'analyzer'],
  },
  {
    title: 'Contract Performance',
    href: '/contract-performance',
    description: 'D3-powered contract execution metrics',
    category: 'simulators',
    keywords: ['performance', 'metrics', 'contract', 'soroban'],
  },
  {
    title: 'Soroban Playground (Web IDE)',
    href: '/playground',
    description: 'In-browser Soroban Rust contract editor and linter',
    category: 'tools',
    keywords: ['playground', 'ide', 'editor', 'rust', 'soroban', 'compile'],
  },
  {
    title: 'Issue Triage Playground',
    href: '/playground/triage',
    description: 'Practice triaging open-source issues',
    category: 'tools',
    keywords: ['triage', 'issues', 'playground'],
  },
  {
    title: 'DevTools: Wallet Debugger',
    href: '/devtools/wallet',
    description: 'Inspect connected Stellar wallet state',
    category: 'tools',
    keywords: ['wallet', 'debug', 'devtools', 'stellar'],
  },
  {
    title: 'DevTools: Embedded Simulator',
    href: '/devtools/simulator',
    description: 'Embedded chain simulator for developers',
    category: 'tools',
    keywords: ['devtools', 'simulator'],
  },
  {
    title: 'DevTools: Fee Inspector',
    href: '/devtools/fees',
    description: 'Inspect Stellar and Soroban fee stats',
    category: 'tools',
    keywords: ['fees', 'gas', 'devtools', 'soroban'],
  },
  {
    title: 'DevTools: Event Log',
    href: '/devtools/events',
    description: 'Soroban contract event log viewer',
    category: 'tools',
    keywords: ['events', 'logs', 'soroban', 'devtools'],
  },
  {
    title: 'DevTools: Storage Explorer',
    href: '/devtools/storage',
    description: 'Browse Soroban contract storage entries',
    category: 'tools',
    keywords: ['storage', 'devtools', 'soroban'],
  },
  {
    title: 'Resource Estimator',
    href: '/resource-estimator',
    description: 'Estimate Soroban compute and storage costs',
    category: 'tools',
    keywords: ['resources', 'cost', 'estimator', 'soroban'],
  },
  {
    title: 'Open-Source Gas Calculator',
    href: '/open-source/gas-calculator',
    description: 'Estimate gas fees for contract calls',
    category: 'tools',
    keywords: ['gas', 'calculator', 'fees'],
  },
  {
    title: 'Hardware Wallet Lab',
    href: '/hardware-wallet',
    description: 'Ledger / WebHID hardware wallet lab',
    category: 'tools',
    keywords: ['ledger', 'hardware', 'wallet', 'hid'],
  },
  {
    title: 'Network Streamer',
    href: '/network-streamer',
    description: 'Live Stellar network transaction stream',
    category: 'tools',
    keywords: ['network', 'stream', 'stellar', 'live'],
  },
  {
    title: 'Bridge Tracker',
    href: '/bridge-tracker',
    description: 'Cross-chain bridge status tracker',
    category: 'tools',
    keywords: ['bridge', 'cross-chain', 'tracker'],
  },
  {
    title: 'Yield Calculator',
    href: '/yield-calculator',
    description: 'Estimate compounding yield returns by APY',
    category: 'tools',
    keywords: ['yield', 'apy', 'defi', 'calculator'],
  },
  {
    title: 'Asset Management',
    href: '/asset-management',
    description: 'Portfolio and tokenized-asset management',
    category: 'tools',
    keywords: ['assets', 'portfolio', 'tokens'],
  },
  {
    title: 'Airdrop Dashboard',
    href: '/airdrop',
    description: 'Claim and track testnet airdrops',
    category: 'tools',
    keywords: ['airdrop', 'claim', 'tokens'],
  },
  {
    title: 'Crowdfunding',
    href: '/crowdfunding',
    description: 'On-chain crowdfunding campaigns',
    category: 'tools',
    keywords: ['crowdfunding', 'campaigns'],
  },
  {
    title: 'Notarization',
    href: '/notarization',
    description: 'Notarize files and documents on-chain',
    category: 'tools',
    keywords: ['notarization', 'hash', 'documents'],
  },
  {
    title: 'Subscriptions',
    href: '/subscriptions',
    description: 'Soroban subscription plan management',
    category: 'tools',
    keywords: ['subscriptions', 'plans', 'soroban'],
  },
  {
    title: 'Certificates Gallery',
    href: '/certificates',
    description: 'Browse issued learning certificates',
    category: 'courses',
    keywords: ['certificates', 'credentials'],
  },
  {
    title: 'Issue Certificate',
    href: '/certificates/generate',
    description: 'Issue a new certificate on Stellar',
    category: 'tools',
    keywords: ['certificates', 'issue', 'generate'],
  },
  {
    title: 'Certificate Explorer',
    href: '/certificates/explorer',
    description: 'Explore certificate records',
    category: 'tools',
    keywords: ['certificates', 'explorer'],
  },
  {
    title: 'Certificate Analytics',
    href: '/certificates/analytics',
    description: 'Certificate issuance analytics',
    category: 'tools',
    keywords: ['certificates', 'analytics'],
  },
  {
    title: 'Verification Center',
    href: '/verify',
    description: 'Verify on-chain certificates and credentials',
    category: 'tools',
    keywords: ['verify', 'credentials', 'certificates'],
  },
  {
    title: 'Open-Source Trainer (Version Control)',
    href: '/version-control',
    description: 'Git, PR exercises, and DID-backed contributor proof',
    category: 'courses',
    keywords: ['git', 'version', 'control', 'did', 'open-source', 'pr'],
  },
  {
    title: 'Passkey Lab',
    href: '/passkey',
    description: 'WebAuthn passkey registration and login',
    category: 'tools',
    keywords: ['passkey', 'webauthn', 'auth'],
  },
  {
    title: 'Blog',
    href: '/blog',
    description: 'Community blog and announcements',
    category: 'docs',
    keywords: ['blog', 'posts'],
  },
  {
    title: 'Forum',
    href: '/forum',
    description: 'Discussion forum for students and mentors',
    category: 'docs',
    keywords: ['forum', 'discussions'],
  },
  {
    title: 'Hackathon Ideas',
    href: '/hackathon-ideas',
    description: 'Generate hackathon ideas by tech and sector',
    category: 'courses',
    keywords: ['hackathon', 'ideas', 'generator'],
  },
  {
    title: 'Idea Explorer',
    href: '/hackathon-ideas/explorer',
    description: 'Browse generated hackathon ideas',
    category: 'courses',
    keywords: ['ideas', 'explorer', 'hackathon'],
  },
  {
    title: 'Idea Feed',
    href: '/ideas',
    description: 'Hackathon idea feed for new teams',
    category: 'courses',
    keywords: ['ideas', 'feed'],
  },
  {
    title: 'Collaborative Lab',
    href: '/collaborative-lab',
    description: 'Real-time collaborative coding lab',
    category: 'tools',
    keywords: ['collaborative', 'lab', 'realtime'],
  },
  {
    title: 'Learning Analytics',
    href: '/analytics',
    description: 'Module completion and retention analytics',
    category: 'tools',
    keywords: ['analytics', 'retention', 'metrics'],
  },
  {
    title: 'Performance Metrics',
    href: '/performance-metrics',
    description: 'Platform performance visualizations',
    category: 'tools',
    keywords: ['performance', 'metrics'],
  },
  {
    title: 'Instructor Analytics',
    href: '/instructor/analytics',
    description: 'Cohort completion and drop-off analytics',
    category: 'tools',
    keywords: ['instructor', 'analytics', 'cohort'],
  },
  {
    title: 'Admin Shell',
    href: '/admin',
    description: 'Admin overview and moderation entry point',
    category: 'tools',
    keywords: ['admin'],
  },
  {
    title: 'Admin: Courses',
    href: '/admin/courses',
    description: 'Create and manage courses and curriculum',
    category: 'tools',
    keywords: ['admin', 'courses', 'curriculum'],
  },
  {
    title: 'Admin: Content',
    href: '/admin/content',
    description: 'Content management for learning modules',
    category: 'tools',
    keywords: ['admin', 'content'],
  },
  {
    title: 'Admin: Moderation',
    href: '/admin/moderation',
    description: 'Moderate community content and reports',
    category: 'tools',
    keywords: ['admin', 'moderation'],
  },
  {
    title: 'Login',
    href: '/auth/login',
    description: 'Email and wallet authentication',
    category: 'docs',
    keywords: ['login', 'auth'],
  },
  {
    title: 'Register',
    href: '/auth/register',
    description: 'Create a new student account',
    category: 'docs',
    keywords: ['register', 'signup', 'auth'],
  },
  {
    title: 'Offline Mode',
    href: '/offline',
    description: 'Offline-capable learning pages',
    category: 'docs',
    keywords: ['offline', 'pwa'],
  },
];

export const CONTRACT_NAMES = [
  'hello_world',
  'certificate',
  'certificate_nft',
  'did_registry',
  'dao_governance',
  'amm',
  'lending_pool',
  'payment_gateway',
  'payment_streaming',
  'quadratic_funding',
  'quadratic_voting',
  'crowdfunding',
  'smart_vault',
  'multisig_wallet_timelock',
  'oracle_aggregator',
  'storage_ttl_manager',
  'contract_events',
  'auth_checker',
  'sybil_resistance',
  'commit_reveal_rng',
  'continuous_bonding_curve',
  'token_migration',
  'fractional_nft_vault',
  'peer_review',
  'freelance-platform',
  'hackathon-team-matching',
  'parametric_insurance',
  'proxy',
  'course_proxy',
  'zk_proof_verifier',
  'testnet_faucet_integration',
];

export function placeholderAddress(seed: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = 'C';
  let h = hash >>> 0;
  for (let i = 0; i < 55; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out += alphabet[h % alphabet.length];
  }
  return out;
}

export function titleize(name: string): string {
  return name
    .split(/[-_]+/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function buildCommandIndex(customActions?: {
  toggleTheme?: () => void;
  connectWallet?: () => void;
}): CommandItem[] {
  const routes: CommandItem[] = NAV_ROUTES.map((r, i) => ({
    id: `route-${i}-${r.href}`,
    title: r.title,
    description: r.description,
    category: r.category,
    keywords: [...(r.keywords ?? []), r.href],
    href: r.href,
  }));

  const contracts: CommandItem[] = CONTRACT_NAMES.map((name) => ({
    id: `contract-${name}`,
    title: `${titleize(name)} Contract`,
    description: `Soroban Rust contract · contracts/${name}`,
    category: 'contracts',
    keywords: ['soroban', 'rust', 'contract', name, titleize(name).toLowerCase()],
    href: `/playground?contract=${name}`,
  }));

  const addresses: CommandItem[] = [
    'certificate',
    'did_registry',
    'dao_governance',
    'quadratic_funding',
    'payment_gateway',
    'certificate_nft',
    'amm',
    'oracle_aggregator',
  ].map((name) => {
    const address = placeholderAddress(`web3-student-lab:${name}:testnet`);
    return {
      id: `address-${name}`,
      title: `${titleize(name)} · Testnet Deployment`,
      description: `Deployed Soroban contract · ${address.slice(0, 12)}…${address.slice(-6)}`,
      category: 'addresses',
      keywords: [
        'deployed',
        'address',
        'testnet',
        'contract',
        'soroban',
        name,
        address,
        address.slice(0, 12),
      ],
      href: `/devtools/storage?contract=${address}`,
      address,
    };
  });

  const docs: CommandItem[] = [
    {
      id: 'doc-api',
      title: 'Stellar RPC & Horizon Documentation',
      description: 'API reference for network queries and transactions',
      category: 'docs',
      href: '/docs/api',
      keywords: ['rpc', 'horizon', 'api', 'stellar'],
    },
    {
      id: 'doc-sdk',
      title: 'Soroban SDK Reference Guide',
      description: 'Types, storage keys, env bindings, and auth',
      category: 'docs',
      href: '/docs/sdk',
      keywords: ['sdk', 'types', 'storage', 'soroban', 'rust'],
    },
    {
      id: 'doc-soroban',
      title: 'Soroban Smart Contract Development',
      description: 'Build Rust smart contracts on Stellar',
      category: 'docs',
      href: '/courses/soroban',
      keywords: ['rust', 'soroban', 'contracts', 'course'],
    },
  ];

  const templates: CommandItem[] = [
    {
      id: 'tpl-token',
      title: 'SEP-41 Token Standard Template',
      description: 'Fungible token smart contract in Soroban Rust',
      category: 'templates',
      href: '/playground?template=sep41',
      keywords: ['token', 'sep41', 'erc20', 'soroban', 'template'],
    },
    {
      id: 'tpl-dao',
      title: 'Governance DAO & Voting Template',
      description: 'On-chain proposals, voting, and execution contract',
      category: 'templates',
      href: '/playground?template=dao',
      keywords: ['dao', 'voting', 'proposals', 'governance', 'soroban'],
    },
  ];

  const actions: CommandItem[] = [
    {
      id: 'action-switch-theme',
      title: 'Switch Color Theme',
      description: 'Toggle between dark and light appearance modes',
      category: 'actions',
      keywords: ['theme', 'mode', 'dark', 'light', 'color', 'toggle'],
      action: customActions?.toggleTheme ?? (() => {
        window.dispatchEvent(new CustomEvent('w3sl:toggle-theme'));
      }),
    },
    {
      id: 'action-connect-wallet',
      title: 'Connect Stellar Wallet',
      description: 'Connect Freighter, xBull, Albedo, or Ledger wallet',
      category: 'actions',
      keywords: ['wallet', 'connect', 'freighter', 'stellar', 'login', 'account'],
      action: customActions?.connectWallet ?? (() => {
        window.dispatchEvent(new CustomEvent('w3sl:connect-wallet'));
      }),
    },
    {
      id: 'action-copy-testnet-hint',
      title: 'Copy Testnet Friendbot URL',
      description: 'Copy the Stellar testnet friendbot funding URL',
      category: 'actions',
      keywords: ['friendbot', 'faucet', 'testnet', 'fund', 'copy'],
      action: () => {
        void navigator.clipboard?.writeText('https://friendbot.stellar.org').catch(() => undefined);
      },
    },
    {
      id: 'action-clear-cache',
      title: 'Clear Editor Cache',
      description: 'Reset local editor state and compiled artifacts',
      category: 'actions',
      keywords: ['clear', 'cache', 'reset', 'editor'],
      action: () => {
        try {
          localStorage.clear();
        } catch {
          // noop
        }
      },
    },
  ];

  return [...routes, ...contracts, ...addresses, ...docs, ...templates, ...actions];
}

export function filterCommands(items: CommandItem[], query: string, limit = 50): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);

  const scored: Array<{ item: CommandItem; score: number }> = [];
  for (const item of items) {
    const haystack =
      `${item.title} ${item.description} ${item.category} ${(item.keywords ?? []).join(' ')} ${item.address ?? ''}`.toLowerCase();
    let qi = 0;
    let score = 0;
    let lastMatch = -1;
    for (let hi = 0; hi < haystack.length && qi < q.length; hi++) {
      if (haystack[hi] === q[qi]) {
        score += lastMatch === hi - 1 ? 2 : 1;
        lastMatch = hi;
        qi++;
      }
    }
    if (qi === q.length) {
      const titleBoost = item.title.toLowerCase().includes(q) ? 10 : 0;
      scored.push({ item, score: score + titleBoost - haystack.indexOf(q[0]) * 0.01 });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
