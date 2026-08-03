import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  css: {
    // Skip all CSS processing in tests — no PostCSS/Tailwind native bindings needed
    modules: { classNameStrategy: "non-scoped" },
    postcss: { plugins: [] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      include: [
        'src/lib/keyboard-navigation.ts',
        'src/lib/editor/SorobanAccessibilityAuditor.ts',
        'src/hooks/useKeyboardNavigation.ts',
        'src/hooks/useFocusTrap.ts',
        'src/hooks/useRovingTabindex.ts',
        'src/hooks/useAccessibilityAudit.ts',
        'src/components/ui/SkipLink.tsx',
        'src/components/ui/FocusTrap.tsx',
        'src/components/playground/AccessibilityAuditPanel.tsx',
      ],
    },
  },
});
