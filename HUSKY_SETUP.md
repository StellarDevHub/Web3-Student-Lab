# Husky Pre-commit Hooks Setup

This project uses Husky to automatically run linting and formatting checks before code is committed.

## What's Configured

### Pre-commit Hook

- Runs `lint-staged` which processes only staged files
- Frontend TypeScript/JavaScript files: ESLint with auto-fix + Prettier formatting
- Backend TypeScript files: Prettier formatting only (to avoid blocking workflow)
- JSON and Markdown files: Prettier formatting

### Scripts Available

- `npm run lint` - Run linting for both frontend and backend
- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check if files are properly formatted

### Dependencies Added

- `husky` - Git hooks management
- `lint-staged` - Run commands on staged files only
- `prettier` - Code formatting
- `concurrently` - Run multiple commands simultaneously

## How It Works

1. When you run `git commit`, Husky intercepts the commit
2. The pre-commit hook runs `lint-staged`
3. `lint-staged` processes only the files you're committing:
   - Frontend files get linted and formatted
   - Backend files get formatted
   - JSON/MD files get formatted
4. If any issues are found and can't be auto-fixed, the commit is blocked
5. Fix the issues and commit again

## Developer Workflow

The setup is designed to not block developers unnecessarily:

- Only staged files are processed (fast)
- Auto-fixable issues are automatically resolved
- Backend linting is disabled in pre-commit to avoid blocking (can be enabled later)
- Formatting is consistent across the codebase

## Manual Commands

You can run these commands manually anytime:

```bash
# Format all files
npm run format

# Check formatting without fixing
npm run format:check

# Run linting
npm run lint

# Run lint-staged manually
npx lint-staged
```

## Customization

To modify what runs on pre-commit, edit the `lint-staged` section in `package.json`.

To add more hooks, create files in `.husky/` directory.
