'use client';

import { useEffect, useRef, useCallback } from 'react';
import { KEYS, getFocusableElements, getFirstFocusable } from '@/lib/keyboard-navigation';

export interface UseFocusTrapOptions {
  enabled?: boolean;
  initialFocus?: boolean;
  returnFocusOnDeactivate?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onEscape?: () => void;
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  {
    enabled = true,
    initialFocus = true,
    returnFocusOnDeactivate = true,
    returnFocusRef,
    onEscape,
  }: UseFocusTrapOptions = {}
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    if (initialFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const target = getFirstFocusable(container) || (container.getAttribute('tabindex') ? container : null);
      if (target) {
        target.focus();
      } else {
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== KEYS.TAB) return;

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === first || !container.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last || !container.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handler);
    return () => {
      container.removeEventListener('keydown', handler);
    };
  }, [containerRef, enabled, initialFocus]);

  useEffect(() => {
    if (!returnFocusOnDeactivate || returnFocusRef) return;

    const container = containerRef.current;
    const previous = previousFocusRef.current;

    return () => {
      if (previous && document.body.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [containerRef, returnFocusOnDeactivate, returnFocusRef]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        onEscapeRef.current?.();
      }
    };

    container.addEventListener('keydown', escapeHandler);
    return () => container.removeEventListener('keydown', escapeHandler);
  }, [containerRef, enabled]);
}

export function useRestoreFocus(
  returnFocusRef?: React.RefObject<HTMLElement | null>
): {
  restoreFocus: () => void;
  saveFocus: () => void;
} {
  const savedRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    savedRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef?.current || savedRef.current;
    if (target && document.body.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }, [returnFocusRef]);

  return { saveFocus, restoreFocus };
}
