import { ProjectIdea } from './generator.service.js';

/**
 * Mock hackathon project ideas for frontend development
 * Used when AI service is offline or unavailable
 */
export const mockProjectIdeas: ProjectIdea[] = [
  {
    title: 'DeFi Learning Dashboard',
    description:
      'A comprehensive dashboard for tracking DeFi protocol learning progress. Users can connect their wallets, analyze their interactions with various DeFi protocols, and receive personalized learning recommendations based on their activity patterns.',
    keyFeatures: [
      'Wallet connection and transaction analysis',
      'Interactive DeFi protocol tutorials',
      'Progress tracking and achievement badges',
      'Personalized learning path recommendations',
    ],
    recommendedTech: ['React', 'TypeScript', 'Web3.js', 'Ethers.js', 'Node.js'],
    difficulty: 'Intermediate',
  },
  {
    title: 'NFT Certificate Verifier',
    description:
      'A platform that issues and verifies educational certificates as NFTs on the blockchain. Students can earn verifiable credentials for completing courses, and employers can instantly verify authenticity.',
    keyFeatures: [
      'NFT minting for course completion certificates',
      'Public verification portal for employers',
      'Batch certificate issuance for institutions',
      'Metadata storage on IPFS',
    ],
    recommendedTech: ['Solidity', 'Hardhat', 'React', 'IPFS', 'Polygon'],
    difficulty: 'Advanced',
  },
  {
    title: 'Crypto Portfolio Tracker',
    description:
      'A real-time cryptocurrency portfolio tracking application with price alerts, profit/loss calculations, and tax reporting features. Supports multiple wallets and exchanges.',
    keyFeatures: [
      'Multi-wallet balance aggregation',
      'Real-time price updates via WebSocket',
      'P&L analytics with charts',
      'Export tax reports in CSV format',
    ],
    recommendedTech: ['Next.js', 'TailwindCSS', 'CoinGecko API', 'PostgreSQL'],
    difficulty: 'Intermediate',
  },
  {
    title: 'DAO Voting Platform',
    description:
      'A decentralized voting system for DAOs with quadratic voting, proposal creation, and transparent result tracking. Includes delegation features for token holders.',
    keyFeatures: [
      'Token-gated proposal creation',
      'Quadratic voting mechanism',
      'Vote delegation system',
      'Real-time result dashboard',
    ],
    recommendedTech: ['Solidity', 'React', 'Wagmi', 'Viem', 'The Graph'],
    difficulty: 'Advanced',
  },
  {
    title: 'Blockchain Job Board',
    description:
      'A Web3-focused job board where companies can post openings and candidates can apply using their on-chain reputation. Features skill verification through smart contracts.',
    keyFeatures: [
      'On-chain reputation scoring',
      'Skill verification via NFT badges',
      'Smart contract-based escrow for hiring',
      'Filter by blockchain expertise',
    ],
    recommendedTech: ['React', 'Node.js', 'MongoDB', 'Ethers.js'],
    difficulty: 'Beginner',
  },
  {
    title: 'Smart Contract Auditor',
    description:
      'An automated smart contract security scanner that detects common vulnerabilities and provides detailed reports. Includes a learning mode explaining each vulnerability type.',
    keyFeatures: [
      'Static code analysis',
      'Common vulnerability detection',
      'Detailed security reports',
      'Educational explanations for issues',
    ],
    recommendedTech: ['Python', 'Slither', 'FastAPI', 'React'],
    difficulty: 'Advanced',
  },
  {
    title: 'Metaverse Event Planner',
    description:
      'A platform for organizing and hosting virtual events in the metaverse. Features ticket NFTs, virtual venue customization, and attendee networking tools.',
    keyFeatures: [
      'NFT-based ticketing system',
      '3D venue builder',
      'Attendee networking lounge',
      'Event recording and replay',
    ],
    recommendedTech: ['Three.js', 'React', 'Solidity', 'Socket.io'],
    difficulty: 'Advanced',
  },
  {
    title: 'Gas Fee Optimizer',
    description:
      'A tool that monitors Ethereum gas fees and suggests optimal transaction times. Includes a transaction scheduler for automated execution during low-fee periods.',
    keyFeatures: [
      'Real-time gas price tracking',
      'Historical gas fee analytics',
      'Transaction scheduler',
      'Customizable price alerts',
    ],
    recommendedTech: ['React', 'Node.js', 'Ethers.js', 'Chart.js'],
    difficulty: 'Beginner',
  },
  {
    title: 'Decentralized Storage Manager',
    description:
      'A user-friendly interface for managing files across multiple decentralized storage networks like IPFS, Arweave, and Filecoin. Features automatic redundancy and access control.',
    keyFeatures: [
      'Multi-protocol storage support',
      'Automatic file redundancy',
      'Access control and sharing',
      'Storage cost optimization',
    ],
    recommendedTech: ['React', 'IPFS', 'Arweave', 'Filecoin API'],
    difficulty: 'Intermediate',
  },
  {
    title: 'Web3 Social Media',
    description:
      'A decentralized social media platform where users own their content and data. Features token-based rewards for quality content and community governance.',
    keyFeatures: [
      'Content ownership via NFTs',
      'Token reward system',
      'Community-driven moderation',
      'Cross-platform content syndication',
    ],
    recommendedTech: ['Next.js', 'Solidity', 'Lens Protocol', 'IPFS'],
    difficulty: 'Intermediate',
  },
];

/**
 * Returns a random selection of mock project ideas
 * @param count - Number of ideas to return (default: all)
 * @returns Array of random project ideas
 */
export function getRandomProjectIdeas(count?: number): ProjectIdea[] {
  const shuffled = [...mockProjectIdeas].sort(() => Math.random() - 0.5);
  return count ? shuffled.slice(0, count) : shuffled;
}

/**
 * Returns a single random project idea
 * @returns A random project idea
 */
export function getRandomProjectIdea(): ProjectIdea {
  const randomIndex = Math.floor(Math.random() * mockProjectIdeas.length);
  return mockProjectIdeas[randomIndex]!;
}
