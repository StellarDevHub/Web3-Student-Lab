# Supply Chain Security Policy

## Scope

This policy covers third-party dependency risk for the following ecosystems used in this repository:

| Ecosystem   | Location              | Audit Command                         |
|-------------|-----------------------|---------------------------------------|
| npm/pnpm    | `frontend/`           | `npm audit --audit-level=high`        |
| npm         | `backend/`            | `npm audit --audit-level=high`        |
| Rust/Cargo  | `contracts/`          | `cargo audit --deny warnings`         |

All three audits are enforced in CI (`.github/workflows/ci.yml`). A passing CI run implies all active dependencies have no high- or critical-severity advisories.

## Severity Thresholds

| Severity  | CI Action                                     | Exception Required |
|-----------|-----------------------------------------------|--------------------|
| Critical  | Fails the workflow                             | Yes                |
| High      | Fails the workflow                             | Yes                |
| Moderate  | Warning (logged, does not fail)                | No                 |
| Low       | Ignored                                        | No                 |

## Exceptions

When a high- or critical-severity advisory cannot be immediately remediated (e.g., no patch available, or the vulnerable code path is unreachable):

1. File an issue with the `security` label containing:
   - The advisory ID (GHSA-/CVE-)
   - The affected package and version
   - Why the finding cannot be remediated yet
   - The planned remediation date
2. Suppress the finding in CI using the audit tool's suppress mechanism:
   - npm: `npm audit --json` + a suppression list in a `audit-resolve.json` or inline ignore
   - Cargo: `cargo audit --ignore RUSTSEC-XXXX-XXXX`
3. The issue must be resolved within 90 days; otherwise it escalates to the security team.

## Development-only vs Runtime Dependencies

- `devDependencies` are excluded from the high-severity failure threshold. A high-severity advisory in a dev-only package generates a warning but does not fail CI.
- `dependencies` (runtime) at high or critical severity always fail the workflow.

## Software Bill of Materials (SBOM)

Each CI run produces a CycloneDX-format SBOM as a build artifact:

| Artifact Name    | Source       | Retention |
|------------------|--------------|-----------|
| `sbom-backend`   | `backend/`   | 90 days   |
| `sbom-frontend`  | `frontend/`  | 90 days   |
| `sbom-contracts` | `contracts/` | 90 days   |

SBOMs are generated using:
- **npm/pnpm**: `npm sbom` (npm >= 10, built-in)
- **Cargo**: `cargo sbom` (via `cargo install cargo-sbom`)

## Local Audit Commands

Before pushing, run the relevant audit for your changes:

```bash
# Backend
cd backend && npm audit --audit-level=high

# Frontend
cd frontend && npm audit --audit-level=high

# Contracts (requires cargo-audit)
cd contracts && cargo audit --deny warnings

# Generate SBOMs locally
cd backend    && npm sbom --output sbom.backend.json
cd frontend   && npm sbom --output sbom.frontend.json
cd contracts  && cargo sbom --output sbom.contracts.json
```

## Remediation SLA

| Severity  | Remediation Deadline      |
|-----------|---------------------------|
| Critical  | 7 days from notification  |
| High      | 30 days from notification |
| Moderate  | 90 days from notification |

## Related Documents

- [`SECURITY.md`](./SECURITY.md) — Vulnerability disclosure and reporting
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — General contribution guidelines
