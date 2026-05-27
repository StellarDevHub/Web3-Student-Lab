# Contributing to Web3 Student Lab

First off, thank you for considering contributing to Web3 Student Lab! It's people like you that
make Web3 Student Lab such a great learning tool for everyone.

## 1. Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our
[Issues](https://github.com/your-repo/issues) to see if someone else has already created a ticket.
If not, go ahead and make one!

## 2. Fork & create a branch

If this is something you think you can fix, then fork Web3 Student Lab and create a branch with a
descriptive name.

Before committing, read [Git Commit Guidelines](CONTRIBUTING_GIT.md) for required commit prefixes
and commit message format.

## 3. Get the code working locally

### Development Tooling

To contribute to the smart contracts, you'll need the following Rust tools:

- **Rust & Cargo**: Follow instructions at [rust-lang.org](https://www.rust-lang.org/tools/install).
- **Clippy**: Run `rustup component add clippy`.
- **WASM Target**: Run `rustup target add wasm32-unknown-unknown`.

### Setup

- Clone your fork locally.
- Run `npm install` at the root path to set up Git hooks.
- Run `npm install` in both `frontend` and `backend` directories.
- Start the servers using `npm run dev`.

## 4. Implement your fix or feature

At this point, you're ready to make your changes! Feel free to ask for help; everyone is a beginner
at first.

> [!IMPORTANT] Please review our [Security Best Practices](docs/SECURITY.md) and
> [CI/CD Pipeline Guide](docs/CICD_GUIDE.md) before making any changes related to secrets, sensitive
> data, or smart contracts.

## 5. Make a Pull Request

At this point, you should switch back to your master branch and make sure it's up to date with Web3
Student Lab's master branch. Then, create a Pull Request against our main repository.

We will review your PR, and once approved, it will be merged into the project!
