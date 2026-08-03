# Accessibility Testing

## Running the tests

```bash
cd frontend
npm test
```

This runs vitest in single-pass mode and prints a verbose result for every test.

For watch mode during development:

```bash
npm run test:watch
```

## What is covered

- `src/test/accessibility.test.tsx` — automated axe scan + keyboard behaviour for the shared `Navbar` component
  - axe violation scan (checks roles, labels, landmark structure)
  - keyboard Escape key does not trigger unrelated controls
  - mobile menu toggle opens/closes correctly

## Adding more tests

1. Create a file under `src/test/` or co-locate as `ComponentName.a11y.test.tsx`.
2. Import `axe` and `toHaveNoViolations` from `jest-axe`, extend `expect`, render, and call `axe(container)`.
3. Mock `next/navigation` and any context providers the component needs (see the existing test for examples).
