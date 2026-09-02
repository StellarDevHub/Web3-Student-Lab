# Contributing to Web3 Student Lab 🎓⛓️

Thank you for your interest in contributing to Web3 Student Lab! We welcome contributions from developers, students, and open-source enthusiasts.

---

## 📝 Commit Conventions (Conventional Commits)

This repository enforces the **[Conventional Commits specification](https://www.conventionalcommits.org/)**. All commit messages and Pull Request titles must follow this structured format:

```text
<type>(<scope>): <short description>
```

### Commit Types

| Type | Description | Example |
| ---- | ----------- | ------- |
| `feat` | A new feature or capability | `feat(security): implement password strength meter and HIBP breach check` |
| `fix` | A bug fix | `fix(playground): resolve compilation timeout in web worker` |
| `docs` | Documentation updates | `docs(readme): add development automation scripts guide` |
| `style` | Formatting, missing semi-colons, no code logic change | `style(frontend): format navbar layout using Tailwind` |
| `refactor` | Code refactoring without changing behavior | `refactor(backend): clean up Redis client connection pool` |
| `perf` | Performance improvement | `perf(simulator): optimize Canvas rendering for block graph` |
| `test` | Adding or updating tests | `test(auth): add unit test for password entropy estimator` |
| `build` | Changes affecting build system or dependencies | `build(deps): add @commitlint devDependencies` |
| `ci` | Changes to CI/CD workflows | `ci(github): add release drafter and commitlint workflows` |
| `chore` | Maintenance tasks | `chore(repo): organize root scripts into scripts/` |

---

## 🚀 Pull Request Guidelines

1. **Title Format**: Ensure your Pull Request title uses Conventional Commits (e.g. `feat(security): add HaveIBeenPwned password check`).
2. **Issue Linking**: Include closing keywords in the PR body (e.g., `Fixes #1194`, `Closes #1200`).
3. **Automated Testing**: Verify all unit tests pass before submitting.
4. **Clean Git History**: Pre-commit hooks will validate commit messages using `commitlint`.

---

## 🛠 Local Setup

```bash
# Clone the repository
git clone https://github.com/StellarDevHub/Web3-Student-Lab.git
cd Web3-Student-Lab

# Install root dependencies
pnpm install

# Start local dev environment
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```
