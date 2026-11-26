import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount rendered React trees and clear DOM between tests.
afterEach(() => {
  cleanup();
});

// jsdom lacks these APIs used by react-joyride (scrolling and layout measurement).
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  if (!window.scrollTo) {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }

  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (typeof window.IntersectionObserver === 'undefined') {
    window.IntersectionObserver = class {
      root = null;
      rootMargin = '';
      thresholds: number[] = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }
}
