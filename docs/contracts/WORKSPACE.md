# Cargo Workspace Membership Guide

This document explains how Soroban contracts under `contracts/` relate to the Cargo
workspace defined in `contracts/Cargo.toml`, and when a new contract should be added
as a workspace member.

## Why this exists

`contracts/` contains three different kinds of content:

1. **Workspace member crates** — directories with their own `Cargo.toml` that are listed
   under `[workspace].members` and build via `cargo check --workspace` / `cargo build --workspace`.
2. **Root educational package** — the workspace root package
   (`soroban-certificate-contract`) whose modules live in `contracts/src/*.rs`. These are
   tutorial / playground templates co-located in one crate; they are **not** separate
   workspace members.
3. **Incomplete scaffolding** — directories that are not yet valid Cargo packages
   (for example `did_registry/` has source but no `Cargo.toml`). These stay out of
   `[workspace].members` (and may be listed under `[workspace].exclude`) until ready.

Running `cargo build` from `contracts/` only builds workspace members. That is
intentional: educational templates in `contracts/src/` and unfinished directories must
not silently break CI or contributor builds.

## Membership criteria

Add a directory to `[workspace].members` **only if all** of the following are true:

| Criterion | Requirement |
| --- | --- |
| Own manifest | Directory has a valid `Cargo.toml` with a `[package]` section |
| Soroban crate | Declares `crate-type` including `cdylib` and/or `rlib` for a contract |
| No nested workspace | Does **not** declare its own `[workspace]` table (nested workspaces conflict with the root) |
| Compiles | `cargo check -p <package-name>` succeeds from `contracts/` |
| Intentional package | Meant to be built, tested, and (optionally) deployed as its own contract |

Do **not** add a path as a member when:

- It only contains loose `.rs` files without a package manifest
- It is a submodule of `contracts/src/` (those belong to the root educational package)
- It is WIP scaffolding that does not yet compile as a standalone crate
- It intentionally remains a standalone nested workspace (prefer converting it instead)

## Adding a new contract to the workspace

1. Create `contracts/<contract_name>/` with `Cargo.toml` and `src/lib.rs`.
2. Do **not** include an empty `[workspace]` section in the new crate's `Cargo.toml`.
3. Append `"<contract_name>"` to `[workspace].members` in `contracts/Cargo.toml`
   (keep the list sorted alphabetically for easier review).
4. From `contracts/`, run:
   ```bash
   cargo check --workspace
   cargo clippy --workspace
   ```
5. Update this doc's inventory table if maintainers ask for an explicit listing in a PR.

## Building and checking

From the repository root:

```bash
cd contracts
cargo check --workspace    # validate every member
cargo build --workspace    # build every member
cargo clippy --workspace   # lint every member
```

To work on a single contract:

```bash
cd contracts
cargo check -p hello_world
# or by directory package name, e.g. smart-vault
cargo check -p smart-vault
```

Standalone historical crates that used an empty `[workspace]` table have been converted
into normal members of this workspace so `cargo check --workspace` covers them.

## CI expectation

The contracts CI job runs `cargo check --workspace` (in addition to fmt/clippy/build) so
every listed member stays buildable. If you add a member that does not compile, CI will fail.

## Inventory snapshot

| Category | Location | In workspace? |
| --- | --- | --- |
| Platform / learning contract crates | `contracts/<name>/` with `Cargo.toml` | Yes — listed in `members` |
| Educational template modules | `contracts/src/*.rs` | Root package only (not separate members) |
| Incomplete scaffolding | e.g. `contracts/did_registry/` | No — excluded until it has a compiling `Cargo.toml` |
