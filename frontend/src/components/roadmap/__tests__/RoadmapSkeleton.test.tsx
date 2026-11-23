import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoadmapSkeleton } from '../RoadmapSkeleton';

describe('RoadmapSkeleton', () => {
  it('renders loading state', () => {
    render(<RoadmapSkeleton />);
    expect(
      screen.getByRole('status')
    ).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<RoadmapSkeleton />);
    expect(
      screen.getByRole('status')
    ).toHaveAttribute('aria-label', 'Loading roadmap');
  });

  it('has screen reader only text', () => {
    render(<RoadmapSkeleton />);
    expect(
      screen.getByText('Loading roadmap visualization...')
    ).toHaveClass('sr-only');
  });
});
