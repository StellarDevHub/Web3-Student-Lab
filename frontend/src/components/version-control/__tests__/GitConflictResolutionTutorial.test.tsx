import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    GitConflictResolutionTutorial,
    validateConflictResolution,
} from '../GitConflictResolutionTutorial';

describe('validateConflictResolution', () => {
  it('fails when markers are still present', () => {
    const result = validateConflictResolution('<<<<<<< HEAD\ncode\n=======\nmore\n>>>>>>> branch');
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Conflict markers are still present/i);
  });

  it('passes when markers are removed and expected logic remains', () => {
    const result = validateConflictResolution(
      'function calculateReward(points) {\n  return points * 2;\n}'
    );

    expect(result.passed).toBe(true);
  });
});

describe('GitConflictResolutionTutorial', () => {
  it('shows failed state when unresolved content is validated', () => {
    render(<GitConflictResolutionTutorial />);

    fireEvent.click(screen.getByRole('button', { name: /validate resolution/i }));

    const status = screen.getByTestId('resolution-status');
    expect(status).toHaveTextContent(/Conflict markers are still present/i);
  });

  it('shows passed state when cleaned content is validated', () => {
    render(<GitConflictResolutionTutorial />);

    fireEvent.click(screen.getByRole('button', { name: /accept current branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /validate resolution/i }));

    const status = screen.getByTestId('resolution-status');
    expect(status).toHaveTextContent(/Great work/i);
  });

  it('increments attempt count after each validation', () => {
    render(<GitConflictResolutionTutorial />);

    fireEvent.click(screen.getByRole('button', { name: /validate resolution/i }));
    fireEvent.click(screen.getByRole('button', { name: /validate resolution/i }));

    expect(screen.getByTestId('attempt-count')).toHaveTextContent('Attempts: 2');
  });
});
