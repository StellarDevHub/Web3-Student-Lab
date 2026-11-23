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
