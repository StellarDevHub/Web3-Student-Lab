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

    container.setAttribute('data-focus-trap-active', 'true');

    const handler = (event: KeyboardEvent) => {
      const activeTraps = document.querySelectorAll<HTMLElement>('[data-focus-trap-active="true"]');
      if (activeTraps[activeTraps.length - 1] !== container) return;

      if (event.key === KEYS.ESCAPE) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }

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

    // Capture at the document so a child widget cannot swallow Tab or Escape.
    document.addEventListener('keydown', handler, true);
    return () => {
      container.removeAttribute('data-focus-trap-active');
      document.removeEventListener('keydown', handler, true);
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
