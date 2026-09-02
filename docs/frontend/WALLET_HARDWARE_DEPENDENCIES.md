# Wallet hardware dependency upgrade process

The hardware wallet integration (`frontend/src/hooks/useHardwareWallet.ts`) depends on two
Ledger packages:

- `@ledgerhq/hw-transport-webhid` — WebHID transport used to talk to a connected Ledger device.
- `@ledgerhq/hw-app-eth` — the Ethereum app client used to derive addresses and sign messages.

Both are pinned to exact versions in `frontend/package.json` (no `^`, `~`, or `latest`). This is
deliberate: a floating `latest` tag on these two packages let `npm ci` (which reads
`frontend/package-lock.json`, the lockfile CI actually installs from) and `pnpm install` (which
reads `frontend/pnpm-lock.yaml`) silently resolve to *different* Ledger versions over time,
so a contributor's local install could differ from what CI tested without anyone changing a line
of code.

## Two lockfiles exist — know which one CI uses

`frontend/` has both `package-lock.json` and `pnpm-lock.yaml`. `package.json` declares
`"packageManager": "pnpm@10.33.0..."`, but `.github/workflows/ci.yml` actually runs `npm ci`
against `frontend/package-lock.json` for the frontend job. **`package-lock.json` is the
lockfile CI treats as authoritative today.** Until that mismatch is resolved as its own
follow-up, keep both lockfiles in sync for any dependency you touch, and don't assume `pnpm`
alone is enough to reproduce what CI runs.

## Upgrading `@ledgerhq/*` packages

1. Pick the target version from the [Ledger JS releases](https://github.com/LedgerHQ/ledger-live/releases)
   and confirm it still supports the BIP44 path and WebHID flow used in `useHardwareWallet.ts`
   (`getAddress`, `signPersonalMessage`).
2. Update the exact version string in `frontend/package.json` for both packages (don't
   reintroduce a range or `latest`).
3. Regenerate **both** lockfiles so they resolve to the same version:
   ```bash
   cd frontend
   npm install --package-lock-only
   pnpm install --lockfile-only
   ```
4. Run the compatibility smoke check: `npx vitest run src/hooks/__tests__/useHardwareWallet.test.ts`.
   It mocks the transport/app modules and asserts `TransportWebHID.create()` and the `Eth`
   constructor are still called the way the hook expects — a breaking API change in a new
   Ledger release will fail here before it reaches real hardware.
5. If you have physical access to a Ledger device, manually verify `connect()` and
   `signPersonalMessage()` against it (WebHID requires a real browser + device; it can't be
   exercised in CI).
6. Note the version bump in the PR description so reviewers can see it was an intentional,
   isolated change — don't bundle unrelated dependency upgrades into the same PR.
