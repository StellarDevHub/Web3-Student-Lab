export const KEYS = {
  TAB: 'Tab',
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  HOME: 'Home',
  END: 'End',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
} as const;

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'iframe',
  'area[href]',
  'audio[controls]',
  'video[controls]',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(elements).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true'
  );
}

export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[0] ?? null;
}

export function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[elements.length - 1] ?? null;
}

export function getNextFocusable(container: HTMLElement, current: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  const index = elements.indexOf(current);
  if (index === -1) return null;
  return elements[index + 1] ?? elements[0] ?? null;
}

export function getPreviousFocusable(
  container: HTMLElement,
  current: HTMLElement
): HTMLElement | null {
  const elements = getFocusableElements(container);
  const index = elements.indexOf(current);
  if (index === -1) return null;
  return elements[index - 1] ?? elements[elements.length - 1] ?? null;
}

export function focusFirstFocusable(container: HTMLElement): void {
  const el = getFirstFocusable(container);
  el?.focus();
}

export function focusLastFocusable(container: HTMLElement): void {
  const el = getLastFocusable(container);
  el?.focus();
}

export function isVisible(element: HTMLElement): boolean {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return getFocusableElements(container).filter(
    (el) => el.tabIndex >= 0
  );
}

export type Direction = 'horizontal' | 'vertical' | 'both' | 'grid';

export interface ArrowNavigationOptions {
  direction: Direction;
  circular?: boolean;
  onActivate?: (element: HTMLElement) => void;
}

export function getArrowNavigationTarget(
  current: HTMLElement,
  key: string,
  options: ArrowNavigationOptions
): HTMLElement | null {
  const { direction, circular = true } = options;
  const parent = current.parentElement;
  if (!parent) return null;

  const siblings = getTabbableElements(parent);

  if (direction === 'grid') {
    return getGridNavigationTarget(current, key, siblings);
  }

  const currentIndex = siblings.indexOf(current);
  if (currentIndex === -1) return null;

  const isHorizontal = direction === 'horizontal' || direction === 'both';
  const isVertical = direction === 'vertical' || direction === 'both';

  if (isHorizontal && key === KEYS.ARROW_RIGHT) {
    const next = siblings[currentIndex + 1];
    if (next) return next;
    return circular ? siblings[0] : null;
  }

  if (isHorizontal && key === KEYS.ARROW_LEFT) {
    const prev = siblings[currentIndex - 1];
    if (prev) return prev;
    return circular ? siblings[siblings.length - 1] : null;
  }

  if (isVertical && key === KEYS.ARROW_DOWN) {
    const next = siblings[currentIndex + 1];
    if (next) return next;
    return circular ? siblings[0] : null;
  }

  if (isVertical && key === KEYS.ARROW_UP) {
    const prev = siblings[currentIndex - 1];
    if (prev) return prev;
    return circular ? siblings[siblings.length - 1] : null;
  }

  return null;
}

function getGridNavigationTarget(
  current: HTMLElement,
  key: string,
  siblings: HTMLElement[]
): HTMLElement | null {
  const parent = current.parentElement;
  if (!parent) return null;

  const parentRect = parent.getBoundingClientRect();
  const currentRect = current.getBoundingClientRect();

  const rowHeight = currentRect.height;
  const colWidth = currentRect.width;

  const currentRow = Math.round((currentRect.top - parentRect.top) / rowHeight);
  const currentCol = Math.round((currentRect.left - parentRect.left) / colWidth);

  const cols = Math.max(1, Math.round(parentRect.width / colWidth));

  let targetIndex = -1;
  const currentIndex = siblings.indexOf(current);

  if (key === KEYS.ARROW_RIGHT) {
    if (currentCol < cols - 1) {
      targetIndex = currentIndex + 1;
    }
  } else if (key === KEYS.ARROW_LEFT) {
    if (currentCol > 0) {
      targetIndex = currentIndex - 1;
    }
  } else if (key === KEYS.ARROW_DOWN) {
    targetIndex = currentIndex + cols;
  } else if (key === KEYS.ARROW_UP) {
    targetIndex = currentIndex - cols;
  }

  if (targetIndex >= 0 && targetIndex < siblings.length) {
    return siblings[targetIndex];
  }

  return null;
}
