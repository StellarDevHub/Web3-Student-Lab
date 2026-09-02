import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorFallback } from '../ErrorFallback';

describe('ErrorFallback', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('renders the default message when no error is provided', () => {
    render(<ErrorFallback />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<ErrorFallback message="Custom error message" />);
    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    const handleRetry = vi.fn();
    render(<ErrorFallback onRetry={handleRetry} />);
    
    const retryButton = screen.getByText('Try again');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders return to dashboard link when onReturnHome is true', () => {
    render(<ErrorFallback onReturnHome={true} />);
    const link = screen.getByText('Return to Dashboard');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('hides sensitive stack traces in production mode', () => {
    process.env.NODE_ENV = 'production';
    const mockError = new Error('Sensitive Database Password');
    render(<ErrorFallback error={mockError} />);
    
    expect(screen.queryByText('Sensitive Database Password')).not.toBeInTheDocument();
  });

  it('shows error message in development mode', () => {
    process.env.NODE_ENV = 'development';
    const mockError = new Error('Sensitive Database Password');
    render(<ErrorFallback error={mockError} />);
    
    expect(screen.getByText('Sensitive Database Password')).toBeInTheDocument();
  });
});
