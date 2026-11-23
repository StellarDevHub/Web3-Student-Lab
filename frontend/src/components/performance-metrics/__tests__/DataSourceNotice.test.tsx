import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataSourceNotice from '../DataSourceNotice';

describe('DataSourceNotice', () => {
  it('shows a live indicator for verified live data', () => {
    render(<DataSourceNotice dataSource="live" />);
    expect(screen.getByRole('status')).toHaveTextContent('Live data');
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('explains cached data and includes the verified timestamp', () => {
    render(
      <DataSourceNotice
        dataSource="cached"
        lastVerifiedAt="2026-07-31T09:00:00.000Z"
        onRetry={vi.fn()}
      />
    );
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/last verified snapshot/i);
    expect(notice).toHaveTextContent(/Verified/);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('states plainly that fallback data is sample data', () => {
    render(<DataSourceNotice dataSource="fallback" onRetry={vi.fn()} />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/sample data/i);
    expect(notice).toHaveTextContent(/unavailable/i);
  });

  it('fires onRetry when the user retries', async () => {
    const onRetry = vi.fn();
    render(<DataSourceNotice dataSource="fallback" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders no retry button when no retry handler is provided', () => {
    render(<DataSourceNotice dataSource="cached" lastVerifiedAt="2026-07-31T09:00:00.000Z" />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
