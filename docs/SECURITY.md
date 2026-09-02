# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

Please report vulnerabilities by opening a private security advisory on GitHub or by emailing security@web3studentlab.com. We aim to acknowledge reports within 24 hours and provide a remediation plan within 72 hours.

## Vulnerability Triage and Remediation SLAs

We use the following service level objectives for security issues identified through automated scanning, bug reports, or audits:

- **Critical**: fix within 24 hours; patch deployed within 48 hours.
- **High**: fix within 72 hours; patch deployed within 7 days.
- **Medium**: fix within 14 days; patch deployed within 30 days.
- **Low**: fix within 30 days; patch deployed within 90 days.

### Triage Workflow

1. Automated scanners (`cargo-audit`, `npm audit`, Dependabot) raise issues in CI.
2. Security team reviews findings daily and assigns severity.
3. Critical/high issues block merges until remediated or accepted with documented risk.
4. Remediation PRs are labeled `security` and reviewed by at least one maintainer.
5. Patches are backported to supported branches when applicable.

## Automated Security Scanning

CI runs continuous vulnerability checks on every commit:

- `cargo-audit` on `contracts/Cargo.lock`
- `npm audit --audit-level=high` on `frontend` and `backend`
- Dependabot opens automated PRs for outdated or vulnerable dependencies

## Secure Development Practices

- All dependencies are pinned and audited before release.
- Secrets are managed via environment variables and never committed.
- Code changes require review and passing CI security checks.
- Production deployments require signed images and least-privilege access.

## Secret Scanning & Leak Prevention

This repository is scanned automatically for exposed credentials using Gitleaks.

### Local Prevention

- Pre-commit hooks run Gitleaks on every `git commit`.
- Install hooks with: `pip install pre-commit && pre-commit install`
- Manual scan: `pre-commit run --all-files`

### CI Enforcement

- Gitleaks runs on every push and pull request across all branches.
- A detected secret fails the workflow immediately.
- Full history is scanned (`fetch-depth: 0`) to catch historical leaks.

### Supported Secret Patterns

Custom rules in `.gitleaks.toml` target:
- Stellar Ed25519 secret seeds (`S[A-Z0-9]{55}`)
- JWT secrets
- Generic API keys
- PEM private key blocks

### Incident Response

If a secret is detected:

1. **Rotate immediately**
   - JWT / API keys: regenerate and deploy new values.
   - Stellar secret keys: move funds to a new account and revoke the old key.
   - Database credentials: reset passwords and rotate connection strings.

2. **Revoke the commit**
   - If the secret was committed, rewrite history to purge it:
     ```bash
     git filter-branch --force --index-filter \
       "git rm --cached --ignore-unmatch path/to/secret" \
       --prune-empty --tag-name-filter cat -- --all
     ```
   - Force-push the rewritten branch and open a PR to update references.

3. **Audit access logs**
   - Review CloudWatch / Datadog for any unauthorized access between the time of leak and rotation.

4. **Notify stakeholders**
   - Report the incident to the security team and affected service owners within 24 hours.

### Reporting

Found a false positive or missed pattern? Open an issue referencing `.gitleaks.toml`.
