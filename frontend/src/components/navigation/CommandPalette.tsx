'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import {
  ArrowRight,
  BookOpen,
  Cpu,
  FileCode,
  Fingerprint,
  FlaskConical,
  Search,
  Terminal,
  Wallet,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export type CommandCategory =
  'courses' | 'contracts' | 'simulators' | 'tools' | 'addresses' | 'docs' | 'templates' | 'actions';

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

interface RouteDef {
  title: string;
  href: string;
  description: string;
  category: CommandCategory;
  keywords?: string[];
}

/**
 * Canonical registry of navigable routes in the app (50+).
 * Kept as data so fuzzy search, sitemap tooling, and tests share one source.
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

const CONTRACT_NAMES = [
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

/** Deterministic placeholder testnet addresses (C… format, 56 chars) for UI indexing. */
function placeholderAddress(seed: string): string {
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

function titleize(name: string): string {
  return name
    .split(/[-_]+/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Build the full searchable command index: routes + contracts + addresses + docs + actions. */
export function buildCommandIndex(): CommandItem[] {
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
    } satisfies CommandItem;
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
          /* noop */
        }
      },
    },
  ];

  return [...routes, ...contracts, ...addresses, ...docs, ...templates, ...actions];
}

/**
 * Lightweight subsequence fuzzy scorer used as a Fuse fallback and in unit tests.
 * Returns items ordered by relevance; empty query returns the first `limit` items.
 */
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
        // Consecutive-character bonus keeps exact matches ranked first.
        score += lastMatch === hi - 1 ? 2 : 1;
        lastMatch = hi;
        qi++;
      }
    }
    if (qi === q.length) {
      // Prefer matches that start early and in the title.
      const titleBoost = item.title.toLowerCase().includes(q) ? 10 : 0;
      scored.push({ item, score: score + titleBoost - haystack.indexOf(q[0]) * 0.01 });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

const CATEGORY_META: Record<CommandCategory, { label: string; Icon: typeof BookOpen }> = {
  courses: { label: 'Courses', Icon: BookOpen },
  contracts: { label: 'Contracts', Icon: FileCode },
  simulators: { label: 'Simulators', Icon: FlaskConical },
  tools: { label: 'Tools', Icon: Cpu },
  addresses: { label: 'Deployed Addresses', Icon: Wallet },
  docs: { label: 'Docs', Icon: Terminal },
  templates: { label: 'Templates', Icon: FileCode },
  actions: { label: 'Actions', Icon: Fingerprint },
};

const RECENTS_KEY = 'w3sl.command-palette.recents';

function loadRecents(all: CommandItem[]): CommandItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    if (!Array.isArray(ids)) return [];
    const byId = new Map(all.map((i) => [i.id, i]));
    return ids
      .map((id) => byId.get(id))
      .filter((i): i is CommandItem => Boolean(i))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export interface CommandPaletteProps {
  items?: CommandItem[];
  placeholder?: string;
  /** Limit visible results (default 50). */
  limit?: number;
}

export function CommandPalette({ items, placeholder, limit = 50 }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recents, setRecents] = useState<CommandItem[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const allItems = useMemo(() => items ?? buildCommandIndex(), [items]);

  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'description', weight: 0.2 },
          { name: 'keywords', weight: 0.25 },
          { name: 'category', weight: 0.05 },
          { name: 'address', weight: 0.05 },
        ],
        threshold: 0.35,
        distance: 100,
        includeScore: true,
        ignoreLocation: true,
      }),
    [allItems]
  );

  const results = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return allItems.slice(0, 30);
    try {
      const hits = fuse.search(query, { limit }).map((r) => r.item);
      if (hits.length > 0) return hits;
    } catch {
      /* fall through to subsequence matcher */
    }
    return filterCommands(allItems, query, limit);
  }, [query, fuse, allItems, limit]);

  // Clamp selection whenever the result set shrinks.
  useEffect(() => {
    setSelectedIndex((prev) => (results.length === 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [results.length]);

  // Global shortcut: Cmd+K / Ctrl+K toggles, Esc closes.
  // Also listens for the explicit trigger event dispatched by CommandPaletteTrigger
  // (synthetic KeyboardEvents are not trusted in all browsers, so the button
  // dispatches a CustomEvent as the reliable path).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    const onOpenEvent = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('w3sl:open-command-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('w3sl:open-command-palette', onOpenEvent);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setRecents(loadRecents(allItems));
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery('');
    setSelectedIndex(0);
    return undefined;
  }, [isOpen, allItems]);

  const executeItem = useCallback(
    (item: CommandItem) => {
      setRecents((prev) => {
        const next = [item, ...prev.filter((i) => i.id !== item.id)].slice(0, 5);
        try {
          localStorage.setItem(RECENTS_KEY, JSON.stringify(next.map((i) => i.id)));
        } catch {
          /* noop */
        }
        return next;
      });
      setIsOpen(false);
      if (item.action) {
        item.action();
        return;
      }
      if (item.href) {
        try {
          router.push(item.href);
        } catch {
          window.location.href = item.href;
        }
      }
    },
    [router]
  );

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length === 0 ? 0 : (prev - 1 + results.length) % results.length
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) executeItem(item);
    }
  };

  // Keep the active option visible during keyboard navigation.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const activeId = results[selectedIndex]
    ? `command-option-${results[selectedIndex].id}`
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      data-testid="command-palette-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 bg-black/70 backdrop-blur-md"
      onClick={() => setIsOpen(false)}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 text-white shadow-2xl shadow-red-900/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-white/10 px-4 py-3">
          <Search className="h-5 w-5 text-gray-400 mr-3 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              placeholder ?? 'Search courses, contracts, simulators, addresses, tools… (Cmd+K)'
            }
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none font-mono"
            aria-label="Search command palette"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            data-testid="command-palette-input"
          />
          <kbd className="hidden sm:inline-block rounded border border-white/20 px-2 py-0.5 text-[10px] font-mono text-gray-400">
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          aria-labelledby={inputId}
          data-testid="command-palette-listbox"
          className="max-h-96 overflow-y-auto p-2"
        >
          {recents.length > 0 && !query && (
            <div className="pb-2 mb-2 border-b border-white/5">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
                Recent
              </div>
              {recents.map((item) => (
                <button
                  key={`recent-${item.id}`}
                  type="button"
                  onClick={() => executeItem(item)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors text-xs text-gray-300"
                >
                  <span className="truncate">{item.title}</span>
                  <ArrowRight className="h-3 w-3 text-gray-500 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No matching commands or topics found.
            </div>
          ) : (
            results.map((item, index) => {
              const meta = CATEGORY_META[item.category];
              const Icon = meta?.Icon ?? Search;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  id={`command-option-${item.id}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-red-500/20 border border-red-500/30 text-white'
                      : 'border border-transparent text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${isSelected ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400'}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {item.description}
                        {item.address ? ` · ${item.address.slice(0, 10)}…` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400 shrink-0 ml-2">
                    {meta?.label ?? item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[10px] font-mono text-gray-500">
          <span>
            <kbd className="rounded border border-white/10 px-1">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-white/10 px-1">Enter</kbd> open
          </span>
          <span>
            <kbd className="rounded border border-white/10 px-1">Esc</kbd> close
          </span>
          <span className="ml-auto">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Small navbar/search trigger that mirrors the Cmd+K shortcut. */
export function CommandPaletteTrigger({ className = '' }: { className?: string }) {
  const open = useCallback(() => {
    window.dispatchEvent(new CustomEvent('w3sl:open-command-palette'));
    // Fallback for any external Cmd+K listeners.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  }, []);
  return (
    <button
      type="button"
      aria-label="Open command palette (Cmd+K)"
      onClick={open}
      className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors ${className}`}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline font-mono">Search…</span>
      <kbd className="hidden sm:inline-block rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-mono">
        ⌘K
      </kbd>
    </button>
  );
}

export default CommandPalette;
