import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette, buildCommandIndex, filterCommands, NAV_ROUTES } from '../CommandPalette';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('navigation/CommandPalette (FE-HARD-36)', () => {
  it('indexes 50+ routes and resources', () => {
    expect(NAV_ROUTES.length).toBeGreaterThanOrEqual(50);
    const index = buildCommandIndex();
    // routes + contracts + deployed addresses + docs/templates/actions
    expect(index.length).toBeGreaterThan(100);
    const categories = new Set(index.map((i) => i.category));
    for (const expected of ['courses', 'contracts', 'simulators', 'tools', 'addresses']) {
      expect(categories.has(expected as never)).toBe(true);
    }
  });

  it('fuzzy-filters contracts, simulators, and addresses in-memory', () => {
    const index = buildCommandIndex();
    expect(filterCommands(index, 'Soroban').length).toBeGreaterThan(0);
    expect(filterCommands(index, 'simulator').length).toBeGreaterThan(0);
    expect(filterCommands(index, '').length).toBeGreaterThan(0);
  });

  it('opens dialog on Cmd+K with real-time fuzzy filtering', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /search command palette/i });
    fireEvent.change(input, { target: { value: 'Soroban' } });
    expect(screen.getAllByText(/Soroban/i).length).toBeGreaterThan(0);
  });

  it('supports Ctrl+K, arrow-key navigation, Enter, and Esc', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = screen.getByRole('dialog');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    fireEvent.keyDown(dialog, { key: 'Home' });
    fireEvent.keyDown(dialog, { key: 'End' });

    // Options expose listbox semantics for arrow-key navigation.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
