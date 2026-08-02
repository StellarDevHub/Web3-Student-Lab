import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoadmapNode } from '../RoadmapNode';
import type { RoadmapNodeData, NodePosition } from '@/lib/types/roadmap';

function createNode(overrides: Partial<RoadmapNodeData> = {}): RoadmapNodeData {
  return {
    id: 'node-1',
    title: 'Smart Contracts',
    description: 'Learn Soroban smart contracts',
    status: 'available',
    moduleId: 'mod-1',
    order: 0,
    level: 0,
    children: [],
    prerequisites: [],
    progress: 0,
    taskCount: 0,
    completedTaskCount: 0,
    ...overrides,
  };
}

const defaultPosition: NodePosition = { x: 0, y: 0 };

describe('RoadmapNode', () => {
  it('renders with correct title', () => {
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    expect(screen.getByText('Smart Contracts')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toContain('Smart Contracts');
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={onSelect}
        onHover={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('node-1');
  });

  it('calls onSelect on Enter key', () => {
    const onSelect = vi.fn();
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={onSelect}
        onHover={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('node-1');
  });

  it('calls onSelect on Space key', () => {
    const onSelect = vi.fn();
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={onSelect}
        onHover={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('node-1');
  });

  it('calls onHover on mouse enter', () => {
    const onHover = vi.fn();
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={onHover}
      />
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(onHover).toHaveBeenCalledWith('node-1');
  });

  it('calls onHover with null on mouse leave', () => {
    const onHover = vi.fn();
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={onHover}
      />
    );
    fireEvent.mouseLeave(screen.getByRole('button'));
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('shows progress percentage for in_progress nodes', () => {
    const node = createNode({
      status: 'in_progress',
      progress: 60,
    });
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('marks locked nodes as aria-disabled', () => {
    const node = createNode({ status: 'locked' });
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('sets aria-current for selected node', () => {
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={true}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-current',
      'step'
    );
  });

  it('does not set aria-current when not selected', () => {
    const node = createNode();
    render(
      <RoadmapNode
        node={node}
        position={defaultPosition}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-current');
  });
});
