# FAQ: Environment Setup for Web3 Student Lab

Welcome! This FAQ is designed to help students quickly resolve common setup issues for Node.js,
Rust, and Git. The tone is supportive — you’re doing great, and every install step is progress.

---

## 1. Node.js installation errors

### 1.1 “node: command not found”

- Cause: Node.js is not installed or not in your PATH.
- Fix:
  - On macOS/Linux: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` then
    `sudo apt-get install -y nodejs` (Ubuntu/Debian) or use `brew install node` (macOS).
  - On Windows: install from https://nodejs.org and restart your terminal.
  - Verify with: `node --version` and `npm --version`.

### 1.2 “ERR_PNPM_ADDING_TO_PROJECT” or package manager lock errors

- Cause: run command in wrong directory or with project already using different package manager.
- Fix:
  - `cd /workspaces/Web3-Student-Lab` first.
  - Use `npm install` if `package-lock.json` exists, `pnpm install` if using `pnpm-lock.yaml`, or
    `yarn install` for `yarn.lock`.
  - Remove conflicting lock files only if you intentionally switch managers.

### 1.3 Compatibility issues (Node version too old/new)

- Cause: project requires modern Node version (>=18).
- Fix:
  - Install `nvm` (macOS/Linux) or `nvm-windows`.
  - `nvm install 20`, then `nvm use 20`.
  - Re-run install commands.

---

## 2. Rust installation and toolchain issues

### 2.1 “command not found: cargo”

- Cause: Rust is not installed or path not loaded.
- Fix:
  - Run: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.
  - Restart terminal or `source $HOME/.cargo/env`.
  - Verify: `rustc --version`, `cargo --version`.

### 2.2 “failed to parse lockfile” or `cargo build` compile errors

- Cause: stale dependencies or incompatible toolchain.
- Fix:
  - Update Rust toolchain: `rustup update`.
  - Use project toolchain if `rust-toolchain.toml` exists: `rustup override set stable` (or specific
    version).
  - Run: `cargo clean && cargo build`.

### 2.3 WebAssembly/Soroban compile issues (especially in contract path)

- Cause: missing wasm32 target or Soroban CLI.
- Fix:
  - `rustup target add wasm32-unknown-unknown`.
  - Install Soroban tools as in repo docs (if present): `cargo install --locked soroban-cli`.

---

## 3. Git installation and common workflows

### 3.1 “git: command not found”

- Cause: Git not installed.
- Fix:
  - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install git`.
  - macOS: `brew install git` or install Xcode command line tools.
  - Windows: install from https://git-scm.com and restart terminal.

### 3.2 “fatal: unable to access 'https://...': SSL certificate problem”

- Cause: missing CA certs or corporate proxy.
- Fix:
  - Ensure `ca-certificates` package is installed (`sudo apt-get install ca-certificates`,
    `sudo update-ca-certificates`).
  - For proxy, configure:
    - `git config --global http.proxy http://proxy.example.com:8080`
    - `git config --global https.proxy http://proxy.example.com:8080`

### 3.3 “error: cannot lock ref ‘refs/heads/main’” or permissions failures

- Cause: concurrent git process or no write permission.
- Fix:
  - Check no other git commands are running in project.
  - `git gc --prune=now` then retry.
  - Ensure you are working in a forked copy and have proper remote URL (SSH/HTTPS).

---

## 4. Friendly troubleshooting checklist

- Check your terminal / shell is restarted after installs.
- Confirm your working directory: `pwd` should be `/workspaces/Web3-Student-Lab`.
- Validate versions:
  - `node --version`
  - `npm --version` or `pnpm --version`
  - `rustc --version`
  - `cargo --version`
  - `git --version`
- If issue persists, copy full command and error text, open a GitHub issue with screenshot and logs,
  and others can help quickly.

---

## 5. Bonus tips

- Use `nvm` for Node versions and `rustup` for Rust toolchains to avoid wide system changes.
- Keep a clean local branch for PR work: `git checkout -b feature/faq` and push to your fork.
- You got this — each setup issue is a learning step that makes you a stronger open-source
  contributor.
