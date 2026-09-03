# Wallet hardware dependency upgrade process

The hardware wallet gateway (`frontend/src/hooks/useHardwareWallet.ts`) communicates with a
Ledger device running the **Stellar** app and depends on three Ledger packages:

- `@ledgerhq/hw-app-str` — the Stellar app client used to derive addresses (`getPublicKey`)
  and sign transactions (`signTransaction`).
- `@ledgerhq/hw-transport-webhid` — WebHID transport used to talk to a connected Ledger device.
- `@ledgerhq/hw-transport-webusb` — WebUSB transport (fallback when WebHID is unavailable).

These are pinned to exact versions in `frontend/package.json` (no `^`, `~`, or `latest`). This is
deliberate: a floating version lets `npm ci` (which reads `frontend/package-lock.json`, the
lockfile CI actually installs from) silently resolve to different Ledger versions over time,
so a contributor's local install could differ from what CI tested without anyone changing a line
of code.

## Which lockfile CI uses

`.github/workflows/ci.yml` runs `npm ci` against `frontend/package-lock.json` for the frontend
job, so **`frontend/package-lock.json` is the authoritative lockfile**. Keep `frontend/pnpm-lock.yaml`
in sync with it when you change a dependency (CI is a pnpm workspace at the repo root, but the
frontend npm lock is what the frontend CI job installs from).

## Upgrading `@ledgerhq/*` packages

1. Pick the target version from the [Ledger JS releases](https://github.com/LedgerHQ/ledger-live/releases)
   and confirm it still supports the BIP-44 Stellar path (`44'/148'`) and the WebHID/WebUSB flow
   used in `useHardwareWallet.ts` (`getPublicKey`, `signTransaction`).
2. Update the exact version string in `frontend/package.json` for each affected package (don't
   reintroduce a range or `latest`). Versions that don't exist on the registry will fail `npm ci`,
   so verify the pin resolves: `npm view @ledgerhq/hw-app-str version`.
3. Regenerate `frontend/package-lock.json`:
   ```bash
   cd frontend
   npm install --legacy-peer-deps --package-lock-only
   ```
4. Run the compatibility smoke check: `npx vitest run src/hooks/__tests__/useHardwareWallet.test.ts`.
   It mocks the transport/app modules and asserts `TransportWebHID.create()` / `TransportWebUSB.create()`
   and the `Str` constructor are still called the way the hook expects — a breaking API change in a
   new Ledger release will fail here before it reaches real hardware.
5. If you have physical access to a Ledger device, manually verify `connect()`,
   `discoverAccounts()`, and `signTransaction()` against it (WebHID/WebUSB requires a real browser
   - device; it can't be exercised in CI).
6. Note the version bump in the PR description so reviewers can see it was an intentional,
   isolated change — don't bundle unrelated dependency upgrades into the same PR.
