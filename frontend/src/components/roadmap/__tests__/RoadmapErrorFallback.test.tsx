import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RoadmapErrorFallback } from '../RoadmapErrorFallback';

afterEach(cleanup);

describe('RoadmapErrorFallback', () => {
  it('renders error message', () => {
    render(
      <RoadmapErrorFallback message="Something went wrong" />
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows default heading', () => {
    render(
      <RoadmapErrorFallback message="Network error" />
    );
    expect(
      screen.getByText('Failed to Load Roadmap')
    ).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', () => {
    const onRetry = vi.fn();
    render(
      <RoadmapErrorFallback
        message="Error occurred"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render retry button when onRetry not provided', () => {
    render(
      <RoadmapErrorFallback message="Error" />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has alert role', () => {
    render(
      <RoadmapErrorFallback message="Test error" />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has aria-live assertive', () => {
    render(
      <RoadmapErrorFallback message="Test error" />
    );
    expect(screen.getByRole('alert')).toHaveAttribute(
      'aria-live',
      'assertive'
    );
  });
});
