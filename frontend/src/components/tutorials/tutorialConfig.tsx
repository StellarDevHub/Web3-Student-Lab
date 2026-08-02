import type { Step } from 'react-joyride';

export type TutorialId = 'simulator' | 'playground' | 'roadmap';

export interface TutorialDefinition {
  id: TutorialId;
  title: string;
  description: string;
  steps: Step[];
}

const commonStyles = {
  tooltip: {
    backgroundColor: '#09090b',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    padding: '20px',
  },
  tooltipContainer: {
    textAlign: 'left' as const,
  },
  buttonPrimary: {
    backgroundColor: '#dc2626',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    padding: '10px 20px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  },
  buttonBack: {
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    marginRight: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  },
  buttonSkip: {
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  },
  buttonClose: {
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 'bold' as const,
  },
};

export const SIMULATOR_TUTORIAL: TutorialDefinition = {
  id: 'simulator',
  title: 'Network Simulator Tutorial',
  description: 'Learn how to use the real-time Stellar ledger observer and transaction visualizer.',
  steps: [
    {
      target: 'body',
      title: 'Network Simulator',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">
            Welcome to the Network Simulator!
          </p>
          <p className="text-sm text-gray-300">
            This tool lets you observe live Stellar ledger activity in real-time. You will see
            ledgers being created, transactions flowing through the network, and a visual graph
            of network interactions.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="simulator-ledgers"]',
      title: 'Ledger Chain',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Ledger Chain Panel</p>
          <p className="text-sm text-gray-300">
            This panel displays the most recent ledgers on the Stellar network. Each ledger
            contains a batch of transactions. Watch how new ledgers are created approximately
            every 5 seconds.
          </p>
        </div>
      ),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="simulator-graph"]',
      title: 'Network Graph',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Network Activity Graph</p>
          <p className="text-sm text-gray-300">
            The interactive graph visualizes transactions as they move through the network.
            Nodes represent accounts and edges represent transactions. This helps you
            understand the flow of assets and contract calls.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="simulator-tx-stream"]',
      title: 'Transaction Stream',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Live Transaction Stream</p>
          <p className="text-sm text-gray-300">
            A real-time feed of all transactions being processed. Each entry shows the
            transaction hash, operation type, and status. Successful transactions are
            marked in green, failed ones in red.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="simulator-controls"]',
      title: 'Simulator Controls',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Control the Feed</p>
          <p className="text-sm text-gray-300">
            Use the live indicator to see connection status and the sync button to pause
            or resume the data feed. Pausing lets you inspect the current state without
            new data coming in.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
  ],
};

export const PLAYGROUND_TUTORIAL: TutorialDefinition = {
  id: 'playground',
  title: 'Soroban Playground Tutorial',
  description: 'Discover how to write, compile, and test Soroban smart contracts in your browser.',
  steps: [
    {
      target: 'body',
      title: 'Soroban Playground',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">
            Welcome to the Soroban Playground!
          </p>
          <p className="text-sm text-gray-300">
            This is a full-featured development environment for writing and testing Soroban
            smart contracts. You can edit code, compile to WASM, and simulate execution —
            all from your browser.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="playground-header"]',
      title: 'Header & Status',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Environment Status</p>
          <p className="text-sm text-gray-300">
            The header shows the current environment status and active network connection.
            The green indicator confirms you are connected to the Stellar testnet.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="playground-file-tree"]',
      title: 'File Tree',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Project File Tree</p>
          <p className="text-sm text-gray-300">
            Browse and manage your project files here. You can switch between source files,
            tests, and configuration. The active file is highlighted for easy navigation.
          </p>
        </div>
      ),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="playground-editor"]',
      title: 'Code Editor',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Code Editor</p>
          <p className="text-sm text-gray-300">
            Write Rust smart contract code with full syntax highlighting, intellisense, and
            real-time collaboration. Multiple users can edit the same file simultaneously
            in collaborative mode.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="playground-compile-btn"]',
      title: 'Execute Logic',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Compile & Execute</p>
          <p className="text-sm text-gray-300">
            Click this button to compile your Rust code into WASM bytecode. The output
            panel on the right will show compilation results, errors, and diagnostics.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="playground-output"]',
      title: 'Execution Output',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Output & Terminal</p>
          <p className="text-sm text-gray-300">
            View compilation output, execution results, and interact with the integrated
            terminal. The terminal provides CLI access for advanced operations like
            testnet deployment.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
  ],
};

export const ROADMAP_TUTORIAL: TutorialDefinition = {
  id: 'roadmap',
  title: 'Technical Roadmap Tutorial',
  description: 'Explore the skill acquisition tree and track your learning progress.',
  steps: [
    {
      target: 'body',
      title: 'Technical Roadmap',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Welcome to the Roadmap!</p>
          <p className="text-sm text-gray-300">
            This interactive roadmap shows your learning journey through the Web3 ecosystem.
            Each node represents a skill area. Complete modules to unlock advanced topics
            and track your progress.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="roadmap-header"]',
      title: 'Roadmap Header',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Module Hierarchy</p>
          <p className="text-sm text-gray-300">
            The roadmap is organized into a hierarchy of modules. Start with Foundations
            and work your way up to Protocol Expert. Each module builds on the previous one.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="roadmap-nodes"]',
      title: 'Skill Nodes',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Interactive Skill Nodes</p>
          <p className="text-sm text-gray-300">
            Click on any node to see its details. Green nodes are completed, red ones are
            in progress, and dimmed nodes are locked. Complete prerequisite modules to
            unlock the next tier.
          </p>
        </div>
      ),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="roadmap-detail"]',
      title: 'Node Details Panel',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Detailed Information</p>
          <p className="text-sm text-gray-300">
            When you select a node, this panel shows its description, current status,
            and available actions. Use the action button to start working on a module
            or review completed material.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-tour-step="roadmap-action-btn"]',
      title: 'Module Actions',
      content: (
        <div>
          <p className="mb-2 text-sm font-bold text-red-500">Take Action</p>
          <p className="text-sm text-gray-300">
            This button lets you engage with the selected module. For in-progress modules,
            it navigates you to the learning content. For locked modules, it shows the
            prerequisites needed to unlock them.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
    },
  ],
};

export const TUTORIALS: Record<TutorialId, TutorialDefinition> = {
  simulator: SIMULATOR_TUTORIAL,
  playground: PLAYGROUND_TUTORIAL,
  roadmap: ROADMAP_TUTORIAL,
};

export function getTutorial(id: TutorialId): TutorialDefinition {
  const tutorial = TUTORIALS[id];
  if (!tutorial) {
    throw new Error(`Tutorial "${id}" not found. Available tutorials: ${Object.keys(TUTORIALS).join(', ')}`);
  }
  return tutorial;
}

export function getTutorialStyles() {
  return {
    options: {
      primaryColor: '#dc2626',
      backgroundColor: '#09090b',
      textColor: '#ffffff',
      arrowColor: '#09090b',
      overlayColor: 'rgba(0, 0, 0, 0.75)',
      zIndex: 1000,
    },
    ...commonStyles,
  };
}
