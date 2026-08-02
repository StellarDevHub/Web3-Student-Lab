# CI/CD Pipeline Guide

This document explains the Continuous Integration and Deployment (CI/CD) pipelines for the Web3
Student Lab project. These pipelines ensure that all code contributions are verified for quality,
security, and correctness before being merged.

## Overview

We use **GitHub Actions** for our CI/CD workflows. The pipeline is triggered automatically on every
`push` to the main branch and for every `pull_request` targeting the main branch.

## CI Pipeline Flow

The CI pipeline is divided into three parallel jobs: **Backend**, **Frontend**, and **Contracts**.

### 1. Code Push / Pull Request

When a contributor pushes code or opens a PR, GitHub Actions initiates the workflow defined in
`.github/workflows/ci.yml`.

### 2. Build Verification

For each service (Backend, Frontend, and Contracts), the pipeline performs a build verification
step:

- **Backend**: Runs `npm run build` to ensure TypeScript compilation passes.
- **Frontend**: Runs `npm run build` (Next.js build) to verify the application can be bundled
  successfully.
- **Contracts**: Runs `cargo build` for Soroban smart contracts.

### 3. Automated Tests and Linting

The pipeline runs the following automated checks to maintain code quality:

#### Backend

- **Unit Tests**: Executes `npm test` using **Jest**. This verifies the core business logic, API
  endpoints, and utility functions.
- **Service Verification**: Ensures that the backend can connect to a mock database and that the API
  schema is consistent.

#### Frontend

- **Linting**: Runs `npm run lint` using **ESLint** to enforce consistent coding styles and catch
  common errors.
- **Static Analysis**: Next.js build verification includes a type-checking phase for TypeScript.

#### Contracts

- **Compilation**: Verifies that the Rust smart contracts compile successfully for the
  `wasm32-unknown-unknown` target.

## Deployment Pipeline (CD)

_Note: Deployment pipelines are currently under development._

The planned flow for CD is as follows:

- **Staging**: Merges to `main` trigger an automatic deployment to a staging environment (e.g.,
  Render or Vercel).
- **Production**: Tagged releases are deployed to the production environment after final manual
  verification.

---

_Last Updated: 2026-03-24_
