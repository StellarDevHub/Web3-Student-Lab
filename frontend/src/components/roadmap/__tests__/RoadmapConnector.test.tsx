import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoadmapConnector } from '../RoadmapConnector';
import type { RoadmapEdgeData, NodePosition } from '@/lib/types/roadmap';

describe('RoadmapConnector', () => {
  const edge: RoadmapEdgeData = {
    id: 'edge-1',
    source: 'node-a',
    target: 'node-b',
    type: 'progression',
  };

  const sourcePos: NodePosition = { x: 0, y: 0 };
  const targetPos: NodePosition = { x: 0, y: 140 };

  it('renders SVG path', () => {
    const { container } = render(
      <svg>
        <RoadmapConnector
          edge={edge}
          sourcePosition={sourcePos}
          targetPosition={targetPos}
          sourceStatus="completed"
          targetStatus="available"
        />
      </svg>
    );
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('d');
    expect(path!.getAttribute('d')).toContain('M');
    expect(path!.getAttribute('d')).toContain('C');
  });

  it('renders with animated circle for active edges', () => {
    const { container } = render(
      <svg>
        <RoadmapConnector
          edge={edge}
          sourcePosition={sourcePos}
          targetPosition={targetPos}
          sourceStatus="in_progress"
          targetStatus="locked"
        />
      </svg>
    );
    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
    expect(circle).toHaveAttribute('r', '3');
  });

  it('does not render animated circle for inactive edges', () => {
    const { container } = render(
      <svg>
        <RoadmapConnector
          edge={edge}
          sourcePosition={sourcePos}
          targetPosition={targetPos}
          sourceStatus="locked"
          targetStatus="locked"
        />
      </svg>
    );
    const circle = container.querySelector('circle');
    expect(circle).not.toBeInTheDocument();
  });

  it('has aria-label on path', () => {
    const { container } = render(
      <svg>
        <RoadmapConnector
          edge={edge}
          sourcePosition={sourcePos}
          targetPosition={targetPos}
          sourceStatus="completed"
          targetStatus="locked"
        />
      </svg>
    );
    const path = container.querySelector('path');
    expect(path).toHaveAttribute(
      'aria-label',
      'Connection from node-a to node-b'
    );
  });
});
