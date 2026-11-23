'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsProvider, useKeyboardShortcuts } from './KeyboardShortcutsProvider';

vi.mock('hotkeys-js', () => {
  const hotkeys = vi.fn();
  hotkeys.unbind = vi.fn();
  hotkeys.filter = vi.fn();
  return {
    default: hotkeys,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    toggleTheme: vi.fn(),
  }),
}));

const TestConsumer = () => {
  const { openShortcutHelp, shortcuts } = useKeyboardShortcuts();
  return (
    <div>
      <button onClick={openShortcutHelp}>Open shortcuts</button>
      <div>{shortcuts.map((shortcut) => shortcut.keys).join(', ')}</div>
    </div>
  );
};

describe('KeyboardShortcutsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders child content and exposes shortcuts', () => {
    render(
      <KeyboardShortcutsProvider>
        <TestConsumer />
      </KeyboardShortcutsProvider>
    );

    expect(screen.getByText(/Open shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText(/mod\+k/)).toBeInTheDocument();
  });

  it('opens the keyboard shortcut modal when requested', () => {
    render(
      <KeyboardShortcutsProvider>
        <TestConsumer />
      </KeyboardShortcutsProvider>
    );

    fireEvent.click(screen.getByText('Open shortcuts'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
  });
});
