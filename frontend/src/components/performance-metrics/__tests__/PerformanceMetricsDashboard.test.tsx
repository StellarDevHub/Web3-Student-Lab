import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PerformanceMetricsDashboard from '../PerformanceMetricsDashboard';
import { generateMockMetrics, generateMockTimeSpent } from '@/lib/analytics/performanceMetrics';

const metrics = generateMockMetrics();
const timeSpent = generateMockTimeSpent();

describe('PerformanceMetricsDashboard export gating', () => {
  it('disables the export for fallback (sample) data', () => {
    render(
      <PerformanceMetricsDashboard
        metrics={metrics}
        timeSpent={timeSpent}
        dataSource="fallback"
      />
    );
    expect(screen.getByRole('button', { name: /export data/i })).toBeDisabled();
    expect(screen.getByText(/sample data/i)).toBeInTheDocument();
  });

  it('enables the export for live data', () => {
    render(
      <PerformanceMetricsDashboard
        metrics={metrics}
        timeSpent={timeSpent}
        dataSource="live"
      />
    );
    const button = screen.getByRole('button', { name: /export data/i });
    expect(button).toBeEnabled();
    expect(screen.getByText(/live data/i)).toBeInTheDocument();
  });

  it('enables the export for cached data and labels its provenance', () => {
    render(
      <PerformanceMetricsDashboard
        metrics={metrics}
        timeSpent={timeSpent}
        dataSource="cached"
        lastVerifiedAt="2026-07-31T09:00:00.000Z"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /export data/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText(/last verified snapshot/i)).toBeInTheDocument();
  });
});
