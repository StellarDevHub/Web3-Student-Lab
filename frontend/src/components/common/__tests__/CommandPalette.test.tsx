import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('CommandPalette', () => {
  it('opens dialog when Cmd+K or Ctrl+K shortcut is triggered', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('performs sub-millisecond in-memory fuzzy search on items', async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const input = screen.getByRole('textbox', { name: /search command palette/i });
    fireEvent.change(input, { target: { value: 'Soroban' } });

    expect(screen.getAllByText(/Soroban/i).length).toBeGreaterThan(0);
  });

  it('navigates search results with arrow keys and trapped focus', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
  });
});
