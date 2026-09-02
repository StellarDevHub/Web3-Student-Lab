import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoadmapLegend } from '../RoadmapLegend';

describe('RoadmapLegend', () => {
  it('renders all four status labels', () => {
    render(<RoadmapLegend />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('has accessible role list', () => {
    render(<RoadmapLegend />);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('has four list items', () => {
    render(<RoadmapLegend />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
  });

  it('applies custom className', () => {
    const { container } = render(<RoadmapLegend className="custom-class" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('custom-class');
  });

  it('has accessible label on list', () => {
    render(<RoadmapLegend />);
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-label',
      'Node status legend'
    );
  });
});
