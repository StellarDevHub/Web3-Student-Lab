'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import {
  KEYS,
  getArrowNavigationTarget,
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  type ArrowNavigationOptions,
} from '@/lib/keyboard-navigation';

export type KeyHandler = (event: KeyboardEvent) => void;

export interface ShortcutMap {
  [key: string]: KeyHandler;
}

export function useGlobalShortcuts(shortcuts: ShortcutMap, enabled = true): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      const key = event.key;
      const mod = event.ctrlKey || event.metaKey;
      const shortcutKey = [
        mod ? 'Ctrl+' : '',
        event.altKey ? 'Alt+' : '',
        event.shiftKey ? 'Shift+' : '',
        key,
      ].join('');

      const handlerFn = shortcutsRef.current[shortcutKey] || shortcutsRef.current[key];
      if (handlerFn) {
        handlerFn(event);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}

export function useArrowNavigation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ArrowNavigationOptions
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (event: KeyboardEvent) => {
      if (![KEYS.ARROW_UP, KEYS.ARROW_DOWN, KEYS.ARROW_LEFT, KEYS.ARROW_RIGHT].includes(event.key)) return;

      const target = event.target as HTMLElement;
      if (!container.contains(target)) return;

      const nextTarget = getArrowNavigationTarget(target, event.key, optionsRef.current);
      if (nextTarget) {
        event.preventDefault();
        nextTarget.focus();
        optionsRef.current.onActivate?.(nextTarget);
      }
    };

    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }, [containerRef]);
}

export interface TypeAheadOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  selector?: string;
  onItemFound?: (element: HTMLElement, query: string) => void;
  timeout?: number;
}

export function useTypeAhead({
  containerRef,
  selector = '[role="option"], [role="menuitem"], [role="tab"]',
  onItemFound,
  timeout = 800,
}: TypeAheadOptions): void {
  const searchRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      searchRef.current += event.key.toLowerCase();
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        searchRef.current = '';
      }, timeout);

      const items = container.querySelectorAll<HTMLElement>(selector);
      const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement);
      const query = searchRef.current;

      for (let i = 0; i < items.length; i++) {
        const idx = (currentIndex + 1 + i) % items.length;
        const text = (items[idx].textContent || '').toLowerCase().trim();
        if (text.startsWith(query)) {
          items[idx].focus();
          onItemFound?.(items[idx], query);
          return;
        }
      }
    };

    container.addEventListener('keydown', handler);
    return () => {
      container.removeEventListener('keydown', handler);
      clearTimeout(timerRef.current);
    };
  }, [containerRef, selector, onItemFound, timeout]);
}

export interface KeyboardNavigationOptions extends ArrowNavigationOptions {
  onActivate?: (element: HTMLElement) => void;
  onEscape?: () => void;
}

export function useKeyboardNavigation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: KeyboardNavigationOptions
): void {
  useArrowNavigation(containerRef, options);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!container.contains(target)) return;
      const { onActivate, onEscape } = options;

      switch (event.key) {
        case KEYS.ENTER:
        case KEYS.SPACE: {
          event.preventDefault();
          onActivate?.(target);
          break;
        }
        case KEYS.ESCAPE: {
          event.preventDefault();
          onEscape?.();
          break;
        }
        case KEYS.HOME: {
          event.preventDefault();
          getFirstFocusable(container)?.focus();
          break;
        }
        case KEYS.END: {
          event.preventDefault();
          getLastFocusable(container)?.focus();
          break;
        }
      }
    };

    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }, [containerRef, options]);
}

export function useFocusVisible(): boolean {
  const [focusVisible, setFocusVisible] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setFocusVisible(true);
    };
    const handleMouseDown = () => setFocusVisible(false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return focusVisible;
}
