'use client';

import { useEffect, useRef, useCallback } from 'react';
import { KEYS, FOCUSABLE_SELECTOR } from '@/lib/keyboard-navigation';

export interface RovingTabindexOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  selector?: string;
  direction?: 'horizontal' | 'vertical' | 'both';
  onItemFocus?: (element: HTMLElement) => void;
}

function getItems(
  container: HTMLElement,
  selector?: string
): HTMLElement[] {
  const s = selector || FOCUSABLE_SELECTOR;
  return Array.from(container.querySelectorAll<HTMLElement>(s)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true'
  );
}

export function useRovingTabindex({
  containerRef,
  selector,
  direction = 'horizontal',
  onItemFocus,
}: RovingTabindexOptions): void {
  const focusedIndexRef = useRef(-1);
  const onItemFocusRef = useRef(onItemFocus);
  onItemFocusRef.current = onItemFocus;

  const updateTabIndices = useCallback(
    (container: HTMLElement, focusedElement: HTMLElement | null) => {
      const items = getItems(container, selector);
      items.forEach((item, index) => {
        if (item === focusedElement) {
          item.tabIndex = 0;
          focusedIndexRef.current = index;
        } else {
          item.tabIndex = -1;
        }
      });
    },
    [selector]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = getItems(container, selector);
    if (items.length > 0) {
      items[0].tabIndex = 0;
      for (let i = 1; i < items.length; i++) {
        items[i].tabIndex = -1;
      }
    }

    const handleFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (container.contains(target)) {
        updateTabIndices(container, target);
        onItemFocusRef.current?.(target);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!container.contains(target)) return;

      const items = getItems(container, selector);
      if (items.length === 0) return;

      const currentIndex = items.indexOf(target);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      const isHorizontal = direction === 'horizontal' || direction === 'both';
      const isVertical = direction === 'vertical' || direction === 'both';

      switch (event.key) {
        case KEYS.ARROW_LEFT:
          if (isHorizontal) {
            event.preventDefault();
            nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          }
          break;
        case KEYS.ARROW_RIGHT:
          if (isHorizontal) {
            event.preventDefault();
            nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          }
          break;
        case KEYS.ARROW_UP:
          if (isVertical) {
            event.preventDefault();
            nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          }
          break;
        case KEYS.ARROW_DOWN:
          if (isVertical) {
            event.preventDefault();
            nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          }
          break;
        case KEYS.HOME:
          event.preventDefault();
          nextIndex = 0;
          break;
        case KEYS.END:
          event.preventDefault();
          nextIndex = items.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== currentIndex) {
        items[nextIndex].tabIndex = 0;
        items[currentIndex].tabIndex = -1;
        items[nextIndex].focus();
        onItemFocusRef.current?.(items[nextIndex]);
      }
    };

    container.addEventListener('focusin', handleFocus);
    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('focusin', handleFocus);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, selector, direction, updateTabIndices]);
}
