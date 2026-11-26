# GitHub OAuth Token Encryption Migration

## What This Does

Encrypts all plaintext `githubAccessToken` values in the `students` table using AES-256-GCM encryption. This is a non-destructive, idempotent migration.

## Prerequisites

1. Set the `TOKEN_ENCRYPTION_KEY` environment variable:
   ```bash
   # Generate a secure 256-bit key
   node -e "console.log(crypto.randomBytes(32).toString('hex'))"

   # Set in .env
   TOKEN_ENCRYPTION_KEY=<your-generated-hex-key>
   ```

2. For key rotation, provide comma-separated keys:
   ```bash
   TOKEN_ENCRYPTION_KEYS=current-key-hex,old-key-hex
   ```
   The FIRST key is used for new encryptions. All keys can decrypt.

## Running the Migration

```bash
# From the backend directory
npx tsx src/migrations/encrypt-existing-tokens.ts
```

## Rollback

If you need to roll back, re-run from a backup with the old plaintext tokens.
The encryption is one-way; tokens cannot be decrypted without the original key.

## Verification

After migration, verify tokens are encrypted:
```bash
# Check a sample - should return JSON with "encrypted", "iv", "authTag", "keyId" fields
psql $DATABASE_URL -c "SELECT id, LEFT(githubAccessToken, 50) FROM students WHERE githubAccessToken IS NOT NULL LIMIT 5;"
```

## Notes

- This migration is **idempotent** — already encrypted tokens are skipped
- The `TOKEN_ENCRYPTION_KEY` must remain available for the lifetime of encrypted tokens
- If the key is lost, all encrypted tokens become unrecoverable
- Store your encryption key securely (e.g., in a secrets manager, not in version control)

## Versioned Payload Key Rotation

For `EncryptionKeyManager`-managed fields, configure versioned 32-byte keys using
`PAYLOAD_ENCRYPTION_KEY_v<N>`. The highest version is used for new writes; keep
older versions configured so existing envelopes remain readable.

1. Add the next key version to the secret store and deploy it alongside all existing versions.
2. Run `npm run keys:rotate` from `backend/`. It scans students in batches and
   re-encrypts `email` and `githubAccessToken` envelopes under the active key.
3. Check the completion logs and rerun until the scan reports no additional
   migrations and no errors. Resolve any failed records before retiring a key.
4. Remove an old payload key only after all stored envelopes have been migrated
   and verified. Keep each previous JWT key configured for at least the maximum
   token lifetime (currently seven days for refresh tokens) before removing it.

JWT signing keys use `ACCESS_TOKEN_SECRET_v<N>` and `REFRESH_TOKEN_SECRET_v<N>`.
New tokens use the highest configured version; verification accepts all
configured versions. The existing unsuffixed secret remains a compatibility
fallback during rollout. Remove previous versions only after their tokens have
expired.
