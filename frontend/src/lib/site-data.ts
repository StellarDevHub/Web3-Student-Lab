import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Compass,
  Fuel,
  LayoutDashboard,
  Rocket,
  Calculator,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  description: string;
};

export const primaryNav: NavItem[] = [
  {
    label: 'Learn',
    href: '/courses',
    description: 'Browse guided learning modules and beginner tracks.',
  },
  {
    label: 'Dashboard',
    href: '/dashboard',
    description: 'Track progress, enrollments, and issued credentials.',
  },
  {
    label: 'Collaborative Lab',
    href: '/collaborative-lab',
    description: 'Work on hackathons, design architecture, and build your decentralized reputation.',
  },
  {
    label: 'Roadmap',
    href: '/roadmap',
    description: 'See the step-by-step path from beginner to builder.',
  },
  {
    label: 'Verify',
    href: '/verify',
    description: 'Check certificate records and public credential status.',
  },
  {
    label: 'Calculator',
    href: '/yield-calculator',
    description: 'Estimate compounding yield returns based on APY, frequency, and lock-up terms.',
  },
  {
    label: 'Gas Auction',
    href: '/mempool-auction',
    description: 'Simulate a mempool fee market where the highest bidders are mined first.',
  },
];

export const spotlightTools = [
  {
    title: 'Course Modules',
    href: '/courses',
    summary: 'Structured lessons for blockchain, Soroban, and open-source collaboration.',
    icon: BookOpen,
  },
  {
    title: 'Project Roadmap',
    href: '/roadmap',
    summary: 'A clearer path from fundamentals to hackathon-ready project work.',
    icon: Compass,
  },
  {
    title: 'Yield Calculator',
    href: '/yield-calculator',
    summary: 'Estimate compounding yield returns based on APY, frequency, and lock-up terms.',
    icon: Calculator,
  },
  {
    title: 'Gas Fee Auction',
    href: '/mempool-auction',
    summary: 'Watch a live mempool sort by fee bids and mine the highest bidders into blocks.',
    icon: Fuel,
  },
  {
    title: 'Verification Center',
    href: '/verify',
    summary: 'Search credentials and see what is verified publicly right now.',
    icon: CheckCircle2,
  },
  {
    title: 'Builder Playground',
    href: '/playground',
    summary: 'Experiment with code, smart-contract ideas, and implementation patterns.',
    icon: BrainCircuit,
  },
  {
    title: 'Learner Dashboard',
    href: '/dashboard',
    summary: 'See active courses, credentials, and progress in one cleaner control panel.',
    icon: LayoutDashboard,
  },
  {
    title: 'Idea Incubator',
    href: '/ideas',
    summary: 'Generate hackathon directions and starter concepts for new teams.',
    icon: Rocket,
  },
];

export const learnerPillars = [
  {
    title: 'Learn By Building',
    body: 'Students move through guided modules, then apply what they learned in practical project work.',
  },
  {
    title: 'Understand Open Source',
    body: 'The platform connects code, contribution, collaboration, and review into one workflow.',
  },
  {
    title: 'Ship Hackathon Projects',
    body: 'Roadmaps, project ideas, and verification tooling make it easier to go from concept to demo.',
  },
];
