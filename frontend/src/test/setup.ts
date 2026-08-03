import "@testing-library/jest-dom";
import { configureAxe } from "jest-axe";

// Configure axe for all tests
configureAxe({
  rules: {
    // Relax color-contrast rule since we test structure not visual design
    "color-contrast": { enabled: false },
  },
});
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Polyfill window.crypto with Node's webcrypto so crypto.subtle is available in jsdom
Object.defineProperty(window, 'crypto', {
  configurable: true,
  value: webcrypto,
});

// Polyfill window.indexedDB from globalThis (set by fake-indexeddb/auto)
if (typeof (globalThis as any).indexedDB !== 'undefined') {
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    writable: true,
    value: (globalThis as any).indexedDB,
  });
}

Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  indexedDB.deleteDatabase('web3-student-lab-p2p-crypto');
});
