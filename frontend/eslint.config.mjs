// @ts-check
import nextConfig from 'eslint-config-next';
import globals from 'globals';

/**
 * ESLint flat configuration for Next.js / TypeScript frontend.
 *
 * eslint-config-next 16.x ships three flat-config entries:
 *   [0] "next"            – JS/TS/JSX/TSX: React, react-hooks, import, jsx-a11y, @next/next
 *   [1] "next/typescript" – TS/TSX: @typescript-eslint parser + rules
 *   [2] ignores block     – .next/**, out/**, build/**, next-env.d.ts
 *
 * We spread those entries, then add a worker-specific override.
 */
export default [
  // ── Core Next.js flat config (includes TS, React hooks, accessibility) ──
  ...nextConfig,

  // ── Web Worker files ──────────────────────────────────────────────────────
  // Worker files run in a DedicatedWorkerGlobalScope, not in a browser window.
  // Override the globals so ESLint doesn't flag `self`, `postMessage`, etc.
  {
    files: ['**/*.worker.ts', '**/*.worker.tsx'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },
];
