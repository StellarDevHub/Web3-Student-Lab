import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KeyboardShortcutsProvider, useKeyboardShortcuts } from './KeyboardShortcutsProvider';
import hotkeys from 'hotkeys-js';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock('hotkeys-js', () => {
  const mockHotkeys: any = jest.fn((keys, callback) => {
    mockHotkeys.callbacks[keys] = callback;
  });
  mockHotkeys.callbacks = {};
  mockHotkeys.filter = jest.fn();
  mockHotkeys.unbind = jest.fn();
  return mockHotkeys;
});

const TestConsumer = () => {
  const { toggleHelp, isHelpOpen } = useKeyboardShortcuts();
  return (
    <div>
      <span data-testid="help-status">{isHelpOpen ? 'Open' : 'Closed'}</span>
      <button onClick={toggleHelp}>Toggle</button>
    </div>
  );
};

describe('KeyboardShortcuts System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hotkeys as any).callbacks = {};
  });

  describe('KeyboardShortcutsProvider', () => {
    it('renders children correctly', () => {
      render(
        <KeyboardShortcutsProvider>
          <div data-testid="child">Child Content</div>
        </KeyboardShortcutsProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('binds and unbinds keyboard shortcuts', () => {
      const { unmount } = render(
        <KeyboardShortcutsProvider>
          <div />
        </KeyboardShortcutsProvider>
      );

      expect(hotkeys).toHaveBeenCalledWith(expect.stringContaining('cmd+k'), expect.any(Function));
      expect(hotkeys).toHaveBeenCalledWith('g+c', expect.any(Function));

      unmount();
      expect(hotkeys.unbind).toHaveBeenCalled();
    });

    it('opens help modal when shortcut is triggered', () => {
      render(
        <KeyboardShortcutsProvider>
          <div />
        </KeyboardShortcutsProvider>
      );

      // Simulate shortcut trigger
      const toggleCallback = (hotkeys as any).callbacks['ctrl+k, cmd+k, ctrl+shift+h, cmd+shift+h'];
      act(() => {
        toggleCallback(new KeyboardEvent('keydown'));
      });

      // Check if modal title is rendered
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('dispatches custom event for theme toggle', () => {
      render(<KeyboardShortcutsProvider><div /></KeyboardShortcutsProvider>);

      const dispatchSpy = jest.spyOn(document, 'dispatchEvent');
      const themeToggleCallback = (hotkeys as any).callbacks['ctrl+shift+t, cmd+shift+t'];

      act(() => {
        themeToggleCallback(new KeyboardEvent('keydown'));
      });

      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
      expect(dispatchSpy.mock.calls[0][0].type).toBe('theme-toggle');

      dispatchSpy.mockRestore();
    });
  });

  describe('useKeyboardShortcuts Hook', () => {
    it('throws error when used outside provider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<TestConsumer />)).toThrow('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
      consoleError.mockRestore();
    });

    it('toggles help modal state via hook context', () => {
      render(
        <KeyboardShortcutsProvider>
          <TestConsumer />
        </KeyboardShortcutsProvider>
      );

      expect(screen.getByTestId('help-status')).toHaveTextContent('Closed');
      fireEvent.click(screen.getByText('Toggle'));
      expect(screen.getByTestId('help-status')).toHaveTextContent('Open');
    });
  });
});