# Secret Scanning Policy

## Overview

This policy defines how secrets (API keys, wallet private keys, tokens, database credentials, and other sensitive configuration) are kept out of version control. It covers CI-based scanning, local pre-commit hooks, and incident remediation.

## Scope

All files in this repository are subject to secret scanning, excluding:

- Files matched by the allowlist in `.gitleaks.toml` (e.g., `.env.example` with `CHANGE_THIS_*` placeholders)
- Test fixture files with narrowly scoped dummy values
- Generated/compiled output directories (`coverage/`, `dist/`)

## CI Scanning

Every push and pull request is scanned by **[Gitleaks](https://github.com/gitleaks/gitleaks)** via the `Secret Scanning` workflow (`.github/workflows/secret-scan.yml`).

- **Result:** If a potential secret is detected, the workflow **fails** and a summary is posted on the PR or commit.
- **Configuration:** `.gitleaks.toml` controls rules and the allowlist.
- **False positives:** If a flagged value is genuinely not a secret, add a regex or path to the `[allowlist]` in `.gitleaks.toml` and document why.

## Local Pre-commit Hook

Contributors are strongly encouraged to install the pre-commit hook to catch secrets before they reach CI:

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Install the gitleaks hook
pre-commit install

# Run on all files once to verify
pre-commit run --all-files
```

The hook runs Gitleaks with the same `.gitleaks.toml` configuration used in CI.

## Remediation Steps

If a real secret is detected in CI:

### 1. Rotate the Compromised Secret

| Secret Type        | Rotation Action                                                        |
|--------------------|------------------------------------------------------------------------|
| API key / token    | Regenerate in the provider's dashboard; update CI secrets               |
| Database password  | Update password in the database server; update `.env` and CI secrets    |
| JWT secret         | Generate a new random secret; update all services that verify tokens     |
| Wallet private key | Transfer funds to a new wallet; never reuse the compromised key         |
| Webhook secret     | Regenerate; update both the provider dashboard and CI secrets           |

### 2. Remove the Secret from Git History

Use `git filter-repo` (preferred) or `git filter-branch`:

```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove the file that contained the secret
git filter-repo --path path/to/leaked-file --invert-paths

# Or remove a specific string from all commits
git filter-repo --replace-text <(echo "LEAKED_SECRET_VALUE")
```

Force-push the cleaned history:

```bash
git push --force --all origin
```

**Important:** Coordinate with all collaborators before force-pushing.

### 3. Notify the Team

- File an internal security incident report.
- If the secret was exposed for more than a few minutes, assume it is compromised even if removed.

### 4. Audit CI Logs

Check CI logs for the leaked value (GitHub Actions masks secrets in logs, but plaintext in code is visible). If the secret appeared in logs:

- Rotate the secret again.
- Consider whether GitHub's secret scanning alerts (enabled at the repository level) caught it.

## Allowlist Policy

Entries in the `.gitleaks.toml` `[allowlist]` section must be:

1. **Narrowly scoped** — prefer a specific regex over a broad path exclusion.
2. **Documented** — each entry should have a comment explaining why it is safe.
3. **Reviewable** — allowlist changes require PR approval.

Values that must never be committed (and should not be allowlisted):

- Real private keys or mnemonics
- Live API tokens or secrets
- Database connection strings with real passwords
- Cloud provider credentials

## Related Documents

- [`SUPPLY_CHAIN_SECURITY.md`](./SUPPLY_CHAIN_SECURITY.md) — Dependency audit and SBOM policy
- [`SECURITY.md`](./SECURITY.md) — Vulnerability disclosure and reporting
- `.gitleaks.toml` — Scan configuration and allowlist
