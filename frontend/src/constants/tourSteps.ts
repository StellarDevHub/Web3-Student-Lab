import type { Step } from 'react-joyride';

export interface CodeTourStep extends Step {
  title: string;
  badge?: string;
}

export const CODE_TOUR_STEPS: CodeTourStep[] = [
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: 'Welcome to Web3 Student Lab!',
    badge: 'Step 1 of 5',
    content:
      'Learn Soroban smart contract development through an interactive three-pane environment. Let’s take a quick 1-minute guided tour of your workspace.',
  },
  {
    target: '#curriculum-panel, [data-tour="curriculum"], aside',
    placement: 'right',
    disableBeacon: true,
    title: 'Curriculum & Theory',
    badge: 'Step 2 of 5',
    content:
      'This panel outlines your active course modules, code specifications, and interactive challenge objectives. Read through before writing your contract.',
  },
  {
    target: '#monaco-editor, [data-tour="editor"], .monaco-editor, main',
    placement: 'bottom',
    disableBeacon: true,
    title: 'Monaco Rust Editor',
    badge: 'Step 3 of 5',
    content:
      'Write your first line of Soroban Rust code here! Define contract functions using #[contractimpl] and utilize Soroban SDK types like Env, Symbol, and Address.',
  },
  {
    target: '#test-output, [data-tour="test-output"], [data-tour="terminal"], footer',
    placement: 'top',
    disableBeacon: true,
    title: 'Automated Test Output',
    badge: 'Step 4 of 5',
    content:
      'Run automated Rust tests directly in your browser. Live terminal feedback confirms unit test assertions and gas estimations in real time.',
  },
  {
    target: '#wallet-button, [data-tour="wallet"], [aria-label*="wallet"], header',
    placement: 'bottom',
    disableBeacon: true,
    title: 'Stellar Wallet & Testnet Verification',
    badge: 'Step 5 of 5',
    content:
      'Connect Freighter or Albedo to sign transactions, deploy your contract to Stellar Testnet, and claim verified NFT completion credentials.',
  },
];
