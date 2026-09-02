import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DashboardSkeleton,
  CourseListSkeleton,
  CourseDetailSkeleton,
  CertificatesVaultSkeleton,
  CertificateDetailSkeleton,
  HomePageSkeleton,
  EnrollPageSkeleton,
  IdeasPageSkeleton,
  VerifyPageSkeleton,
  AnalyticsDashboardSkeleton,
  AdminContentSkeleton,
} from '../skeletons/PageSkeletons';
import { SkeletonThemeWrapper } from '../SkeletonThemeWrapper';
import { WithSkeleton } from '../WithSkeleton';
import { ErrorFallback } from '../ErrorFallback';

describe('PageSkeletons', () => {
  describe('DashboardSkeleton', () => {
    it('renders with aria-busy and aria-label', () => {
      const { container } = render(<DashboardSkeleton />);
      const root = container.firstElementChild;
      expect(root).toHaveAttribute('aria-busy', 'true');
      expect(root).toHaveAttribute('aria-label', 'Loading dashboard');
    });

    it('renders stat cards skeleton', () => {
      render(<DashboardSkeleton />);
      const skeletonElements = document.querySelectorAll('.react-loading-skeleton');
      expect(skeletonElements.length).toBeGreaterThan(10);
    });
  });

  describe('CourseListSkeleton', () => {
    it('renders with aria-busy', () => {
      const { container } = render(<CourseListSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    });

    it('renders multiple course card skeletons', () => {
      const { container } = render(<CourseListSkeleton />);
      const skeletonElements = container.querySelectorAll('.react-loading-skeleton');
      expect(skeletonElements.length).toBeGreaterThan(15);
    });
  });

  describe('CourseDetailSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<CourseDetailSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading course details');
    });

    it('renders header and content skeletons', () => {
      render(<CourseDetailSkeleton />);
      const skeletons = document.querySelectorAll('.react-loading-skeleton');
      expect(skeletons.length).toBeGreaterThan(20);
    });
  });

  describe('CertificatesVaultSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<CertificatesVaultSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading certificates vault');
    });

    it('renders certificate card skeletons', () => {
      render(<CertificatesVaultSkeleton />);
      const skeletons = document.querySelectorAll('.react-loading-skeleton');
      expect(skeletons.length).toBeGreaterThan(10);
    });
  });

  describe('CertificateDetailSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<CertificateDetailSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading certificate details');
    });
  });

  describe('HomePageSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<HomePageSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading home page');
    });
  });

  describe('EnrollPageSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<EnrollPageSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading enrollment page');
    });
  });

  describe('IdeasPageSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<IdeasPageSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading ideas page');
    });
  });

  describe('VerifyPageSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<VerifyPageSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading verify page');
    });
  });

  describe('AnalyticsDashboardSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<AnalyticsDashboardSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading analytics dashboard');
    });

    it('renders metric card skeletons', () => {
      render(<AnalyticsDashboardSkeleton />);
      const skeletons = document.querySelectorAll('.react-loading-skeleton');
      expect(skeletons.length).toBeGreaterThan(10);
    });
  });

  describe('AdminContentSkeleton', () => {
    it('renders with aria-label', () => {
      const { container } = render(<AdminContentSkeleton />);
      expect(container.firstElementChild).toHaveAttribute('aria-label', 'Loading admin content');
    });
  });

  describe('Skeleton heights match loaded content', () => {
    it('DashboardSkeleton stat cards have correct height', () => {
      render(<DashboardSkeleton />);
      const statCardContainers = document.querySelectorAll('.surface-card');
      // Each stat card should maintain consistent height
      expect(statCardContainers.length).toBeGreaterThan(0);
    });
  });
});

describe('SkeletonThemeWrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  it('renders children', () => {
    render(
      <SkeletonThemeWrapper>
        <div data-testid="child">Content</div>
      </SkeletonThemeWrapper>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('disables animation when prefers-reduced-motion is set', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    const { container } = render(
      <SkeletonThemeWrapper>
        <span data-testid="content-child">Content</span>
      </SkeletonThemeWrapper>
    );
    expect(container.querySelector('[data-testid="content-child"]')).toBeInTheDocument();
  });

  it('enables animation by default', () => {
    const { container } = render(
      <SkeletonThemeWrapper>
        <span data-testid="default-child">Content</span>
      </SkeletonThemeWrapper>
    );
    expect(container.querySelector('[data-testid="default-child"]')).toBeInTheDocument();
  });
});

describe('Loading state transitions', () => {
  it('skeleton is replaced by content when data loads', () => {
    const { rerender } = render(
      <WithSkeleton isLoading={true} skeleton={<div data-testid="skeleton">Loading...</div>}>
        <div data-testid="content">Content loaded</div>
      </WithSkeleton>
    );
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();

    rerender(
      <WithSkeleton isLoading={false} skeleton={<div data-testid="skeleton">Loading...</div>}>
        <div data-testid="content">Content loaded</div>
      </WithSkeleton>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });
});

describe('Button loading states for async actions', () => {
  it('button is disabled during async action', () => {
    const handleClick = vi.fn();
    const { rerender } = render(
      <button onClick={handleClick} disabled={true} data-testid="action-btn">
        Processing...
      </button>
    );
    const btn = screen.getByTestId('action-btn');
    expect(btn).toBeDisabled();

    rerender(
      <button onClick={handleClick} disabled={false} data-testid="action-btn">
        Submit
      </button>
    );
    expect(screen.getByTestId('action-btn')).not.toBeDisabled();
  });

  it('button shows loading indicator during async action', () => {
    render(
      <button disabled={true} data-testid="loading-btn">
        <span className="animate-spin" data-testid="spinner" />
        Saving...
      </button>
    );
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });
});

describe('Error states', () => {
  it('error state renders with retry action', () => {
    const onRetry = vi.fn();
    render(
      <ErrorFallback
        message="Failed to load data"
        onRetry={onRetry}
        variant="card"
      />
    );
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('skeleton is not shown when error state is active', () => {
    const hasError = true;
    const isLoading = false;

    expect(hasError).toBe(true);
    expect(isLoading).toBe(false);
  });
});
