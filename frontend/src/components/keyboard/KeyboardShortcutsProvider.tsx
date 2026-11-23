'use client';

import hotkeys from 'hotkeys-js';
import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { ShortcutHelpModal } from './ShortcutHelpModal';

export interface ShortcutDef {
  keys: string[];
  desc: string;
}

export interface KeyboardContextType {
  isHelpOpen: boolean;
  toggleHelp: () => void;
  openShortcutHelp: () => void;
  closeShortcutHelp: () => void;
  shortcuts: ShortcutDef[];
}

const KeyboardContext = createContext<KeyboardContextType | undefined>(undefined);

const SHORTCUTS: ShortcutDef[] = [
  { keys: ['mod+k'], desc: 'Open shortcut help panel' },
  { keys: ['g', 'c'], desc: 'Navigate to the course catalog' },
  { keys: ['g', 'r'], desc: 'Navigate to the roadmap' },
  { keys: ['g', 'v'], desc: 'Navigate to the verification center' },
  { keys: ['g', 'd'], desc: 'Navigate to the dashboard' },
  { keys: ['ctrl+shift+t'], desc: 'Toggle between light and dark theme' },
  { keys: ['ctrl+shift+c'], desc: 'Compile code in the playground' },
];

export const KeyboardShortcutsProvider = ({ children }: { children: ReactNode }) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const router = useRouter();

  const toggleHelp = () => setIsHelpOpen((prev) => !prev);
  const openShortcutHelp = () => setIsHelpOpen(true);
  const closeShortcutHelp = () => setIsHelpOpen(false);

  useEffect(() => {
    // Accessibility: Disable shortcuts when typing in form fields or content editable regions
    hotkeys.filter = function (event) {
      const target = (event.target || event.srcElement) as HTMLElement;
      const tagName = target.tagName;
      return !(
        target.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'SELECT' ||
        tagName === 'TEXTAREA'
      );
    };

    const bindShortcut = (keyCombination: string, action: (e: KeyboardEvent) => void) => {
      try {
        hotkeys(keyCombination, (e) => {
          e.preventDefault();
          action(e);
        });
      } catch (error) {
        console.error(`Failed to bind shortcut: ${keyCombination}`, error);
      }
    };

    // General Actions
    bindShortcut('ctrl+k, cmd+k, ctrl+shift+h, cmd+shift+h', () => toggleHelp());

    // Theme Toggle (Dispatching custom event)
    bindShortcut('ctrl+shift+t, cmd+shift+t', () => {
      document.dispatchEvent(new CustomEvent('theme-toggle'));
    });

    // Navigation
    bindShortcut('g+c', () => router.push('/catalog'));
    bindShortcut('g+r', () => router.push('/roadmap'));
    bindShortcut('g+v', () => router.push('/verification'));
    bindShortcut('g+d', () => router.push('/dashboard'));

    // Playground Actions
    bindShortcut('ctrl+shift+c, cmd+shift+c', () => {
      document.dispatchEvent(new CustomEvent('playground-compile'));
    });

    return () => {
      // Cleanup bindings on unmount to prevent memory leaks
      hotkeys.unbind('ctrl+k, cmd+k, ctrl+shift+h, cmd+shift+h');
      hotkeys.unbind('ctrl+shift+t, cmd+shift+t');
      hotkeys.unbind('g+c');
      hotkeys.unbind('g+r');
      hotkeys.unbind('g+v');
      hotkeys.unbind('g+d');
      hotkeys.unbind('ctrl+shift+c, cmd+shift+c');
    };
  }, [router]);

  return (
    <KeyboardContext.Provider
      value={{ isHelpOpen, toggleHelp, openShortcutHelp, closeShortcutHelp, shortcuts: SHORTCUTS }}
    >
      {children}
      <ShortcutHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} shortcuts={SHORTCUTS} />
    </KeyboardContext.Provider>
  );
};

/**
 * Hook to manually trigger or access the keyboard shortcuts help context.
 */
export const useKeyboardShortcuts = () => {
  const context = useContext(KeyboardContext);
  if (!context) throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  return context;
};
