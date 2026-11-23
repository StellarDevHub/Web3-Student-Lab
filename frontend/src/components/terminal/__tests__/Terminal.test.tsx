import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Terminal } from '../Terminal';

describe('Accessible Terminal Component (WCAG 2.1 AA)', () => {
  it('renders with appropriate accessibility roles, labels, and live regions', () => {
    render(<Terminal />);

    // Region label
    expect(
      screen.getByRole('region', { name: /interactive terminal simulator/i })
    ).toBeInTheDocument();

    // Log live region
    const outputLog = screen.getByRole('log', { name: /terminal output log/i });
    expect(outputLog).toBeInTheDocument();
    expect(outputLog).toHaveAttribute('aria-live', 'polite');
    expect(outputLog).toHaveAttribute('aria-atomic', 'false');
    expect(outputLog).toHaveAttribute('tabindex', '0');

    // Input with label and accessible instructions
    const input = screen.getByRole('textbox', { name: /terminal command line input/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby', 'terminal-instructions');
  });

  it('executes commands and updates live announcements for screen readers', () => {
    render(<Terminal />);

    const input = screen.getByRole('textbox', { name: /terminal command line input/i });
    fireEvent.change(input, { target: { value: 'help' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Output is displayed in log
    expect(screen.getByText(/Stellar Terminal Simulator/i)).toBeInTheDocument();

    // Status announcement is updated for assistive technology
    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent(/Command executed: help/i);
  });

  it('supports Ctrl+L keyboard shortcut to clear the terminal', () => {
    render(<Terminal />);

    const input = screen.getByRole('textbox', { name: /terminal command line input/i });
    fireEvent.change(input, { target: { value: 'help' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Press Ctrl+L
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true });

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent(/Terminal cleared/i);
  });

  it('clears input line when pressing Escape', () => {
    render(<Terminal />);

    const input = screen.getByRole('textbox', { name: /terminal command line input/i });
    fireEvent.change(input, { target: { value: 'stellar contract deploy' } });
    expect(input).toHaveValue('stellar contract deploy');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});
