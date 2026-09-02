# Stellar Consensus Protocol (SCP) Visualizer

An interactive, educational visualization of the Stellar Consensus Protocol's Nomination and Ballot phases, demonstrating how validators reach consensus in a distributed network.

## Overview

The SCP Visualizer demonstrates:
- **Nomination Phase**: Validators broadcast candidate values and collect nominations
- **Ballot Phase**: Validators move through VOTE → ACCEPT → CONFIRM stages
- **Node Failures**: Simulates validator failures and consensus resilience
- **Real-time Visualization**: D3.js-powered SVG rendering with smooth animations

## Features

### Interactive Controls
- **Start/Pause**: Run or pause the simulation
- **Step**: Advance one step at a time for detailed learning
- **Reset**: Return to initial state
- **Speed Control**: Adjust simulation speed (200ms - 2000ms per step)
- **Node Failure Toggle**: Click any validator node to simulate failure

### Visual Feedback
- **Node States**: Color-coded by consensus phase
  - Idle (gray)
  - Nominating (amber)
  - Voting (blue)
  - Accepted (purple)
  - Confirmed (green)
  - Failed (red)
- **Active Edges**: Animated dashed lines showing message passing
- **Real-time Metrics**: Round counter and phase indicator

### Educational Content
- **Phase Descriptions**: Contextual explanations of each phase
- **Node State Display**: Track individual validator states
- **Legend**: Color reference for all states
- **Consensus Status**: Visual indicator when consensus is reached or fails

## Installation

The component uses **D3.js v7.9.0**, which is already installed in the project.

### Basic Usage

```tsx
import { SCPVisualizer } from '@/components/stellar-scp';

export default function Page() {
  return <SCPVisualizer />;
}
```

### Type Definitions

```tsx
import type { SCPNode, SCPEdge, SCPState, NodeState, Phase } from '@/components/stellar-scp';

type NodeState = 'idle' | 'nominating' | 'voting' | 'accepted' | 'confirmed' | 'failed';
type Phase = 'nomination' | 'ballot';

interface SCPNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  isValidator: boolean;
  quorumSet: string[];
  failed: boolean;
}

interface SCPEdge {
  source: string;
  target: string;
  active: boolean;
  messageType: 'nominate' | 'vote' | 'accept' | 'confirm';
}

interface SCPState {
  phase: Phase;
  round: number;
  nodes: SCPNode[];
  edges: SCPEdge[];
  isRunning: boolean;
  speed: number;
  step: number;
}
```

## Component Structure

```
stellar-scp/
├── SCPVisualizer.tsx          # Main component
├── SCPVisualizer.test.tsx     # Unit tests
├── index.ts                   # Exports
└── README.md                  # This file
```

## How It Works

### Network Layout
- 7 validator nodes arranged in a circle
- Each validator has a quorum set of 3 nodes (adjacent validators)
- Edges represent communication paths between validators

### Simulation Steps

#### Nomination Phase (Steps 0-2)
1. **Step 0**: All non-failed nodes enter "nominating" state
   - Message type: `nominate`
   - Edges activate showing nomination broadcast
2. **Step 1**: Nodes collect nominations from quorum
   - Nodes transition to "voting" state
3. **Step 2**: Nomination complete
   - Phase transitions to Ballot

#### Ballot Phase (Steps 0-3)
4. **Step 0**: Nodes broadcast votes
   - Message type: `vote`
5. **Step 1**: Nodes receive votes and accept
   - Message type: `accept`
   - Nodes transition to "accepted" state
6. **Step 2**: Quorum consensus on value
   - Message type: `confirm`
   - Nodes transition to "confirmed" state
7. **Step 3**: Consensus reached
   - Simulation stops
   - Status shows "✓ Consensus Reached"

### Failure Handling
- Failed nodes remain in "failed" state throughout
- Failed nodes' edges become inactive
- Consensus still reaches if ≥66% of validators are alive
- If <66% remain: "✗ Consensus Failed" state

## Styling

The component uses **Tailwind CSS** with a dark theme:
- Background: `bg-slate-950` (#0f172a)
- Primary accent: `text-blue-400` (sky blue)
- Text: `text-slate-100` (light gray)
- State colors match node state colors

## Accessibility

### ARIA Labels
- SVG elements have proper `role` and `aria-label` attributes
- Screen reader descriptions for graph content
- Semantic HTML structure

### Keyboard Navigation
- All buttons are keyboard accessible
- Click-to-fail nodes support keyboard interaction
- Proper focus management

### Visual
- High contrast colors
- Clear state indicators
- Status messages for screen readers
- Tooltips for interactive elements

## Browser Compatibility

- Modern browsers supporting:
  - ES2022
  - SVG
  - CSS Grid/Flexbox
  - D3.js v7

## Testing

Unit tests cover:
- Component rendering
- Initial state
- Button interactions (Start, Pause, Step, Reset)
- Node state display
- Phase transitions
- Speed control
- Legend and descriptions
- Accessibility features

Run tests with:
```bash
pnpm test src/components/stellar-scp/SCPVisualizer.test.tsx
```

## Performance Considerations

- **Virtualized Rendering**: D3 efficiently updates only changed elements
- **Debounced Resize**: Window resize events are debounced
- **Smooth Transitions**: CSS transitions (300ms) for visual feedback
- **Efficient State Updates**: React reconciliation optimized with data keys

## Future Enhancements

Potential improvements for future iterations:

1. **Custom Quorum Sets**: Allow users to define custom quorum configurations
2. **Multiple Rounds**: Support multiple consensus rounds
3. **Network Statistics**: Display quorum slice information and voting patterns
4. **Byzantine Failures**: Simulate different failure types
5. **Performance Metrics**: Show consensus time and message counts
6. **Export Simulation**: Save/load simulation states
7. **Interactive Tooltips**: Hover information on nodes and edges
8. **Theme Support**: Light/dark theme toggle

## References

- [Stellar Consensus Protocol Whitepaper](https://stellar.org/papers/stellar-consensus-protocol)
- [Stellar Developer Guide](https://developers.stellar.org/)
- [D3.js Documentation](https://d3js.org/)

## License

Same as the Web3-Student-Lab project.

## Support

For issues or questions about the SCP Visualizer:
1. Check the existing tests for usage examples
2. Review the type definitions for component API
3. Consult the Stellar documentation for protocol details
