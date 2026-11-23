import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoadmapDetailPanel } from '../RoadmapDetailPanel';
import type { RoadmapNodeData } from '@/lib/types/roadmap';

function createNode(overrides: Partial<RoadmapNodeData> = {}): RoadmapNodeData {
  return {
    id: 'node-1',
    title: 'Smart Contracts',
    description: 'Learn Soroban smart contracts development',
    status: 'available',
    moduleId: 'mod-1',
    order: 0,
    level: 0,
    children: [],
    prerequisites: [],
    progress: 0,
    taskCount: 4,
    completedTaskCount: 0,
    ...overrides,
  };
}

describe('RoadmapDetailPanel', () => {
  it('renders empty state when no node selected', () => {
    render(
      <RoadmapDetailPanel
        node={null}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(
      screen.getByText(/select a node/i)
    ).toBeInTheDocument();
  });

  it('renders node title and description', () => {
    const node = createNode();
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('Smart Contracts')).toBeInTheDocument();
    expect(
      screen.getByText(/Learn Soroban/i)
    ).toBeInTheDocument();
  });

  it('displays task count', () => {
    const node = createNode({ taskCount: 4, completedTaskCount: 2 });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('renders progress bar with correct value', () => {
    const node = createNode({ progress: 75 });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '75');
  });

  it('shows level badge', () => {
    const node = createNode({ level: 2 });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('Level 3')).toBeInTheDocument();
  });

  it('shows prerequisites section when present', () => {
    const node = createNode({ prerequisites: ['mod-prev'] });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
    expect(screen.getByText('mod-prev')).toBeInTheDocument();
  });

  it('does not show prerequisites when empty', () => {
    const node = createNode({ prerequisites: [] });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.queryByText('Prerequisites')).not.toBeInTheDocument();
  });

  it('calls onNavigate when action button clicked for available node', () => {
    const onNavigate = vi.fn();
    const node = createNode({ status: 'available' });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={onNavigate}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    const buttons = screen.getAllByRole('button');
    const actionButton = buttons.find(
      (b) => b.textContent === 'Locked'
    );
    expect(actionButton).toBeDefined();
    fireEvent.click(actionButton!);
    expect(onNavigate).toHaveBeenCalledWith('node-1');
  });

  it('disables action button for locked nodes', () => {
    const node = createNode({ status: 'locked' });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    const button = screen.getByRole('button', { name: /locked/i });
    expect(button).toBeDisabled();
  });

  it('shows Mark Complete button for non-locked nodes', () => {
    const node = createNode({ status: 'available' });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('Mark Complete')).toBeInTheDocument();
  });

  it('shows Mark Incomplete for completed nodes', () => {
    const node = createNode({ status: 'completed' });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(screen.getByText('Mark Incomplete')).toBeInTheDocument();
  });

  it('calls onToggleComplete when mark complete clicked', () => {
    const onToggle = vi.fn();
    const node = createNode({ status: 'available' });
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={onToggle}
        courseTitle="Test Course"
      />
    );
    fireEvent.click(screen.getByText('Mark Complete'));
    expect(onToggle).toHaveBeenCalledWith('node-1', true);
  });

  it('has accessible role for the aside', () => {
    const node = createNode();
    render(
      <RoadmapDetailPanel
        node={node}
        onNavigate={vi.fn()}
        onToggleComplete={vi.fn()}
        courseTitle="Test Course"
      />
    );
    expect(
      screen.getByRole('complementary')
    ).toBeInTheDocument();
  });
});
