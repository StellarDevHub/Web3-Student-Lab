import prisma from '../db/index.js';
import { encryptToken, isTokenEncrypted } from '../utils/tokenEncryption.js';
import logger from '../utils/logger.js';

/**
 * Migration script to encrypt existing plaintext GitHub OAuth tokens.
 *
 * Usage:
 *   npx tsx src/migrations/encrypt-existing-tokens.ts
 *
 * This script:
 * 1. Finds all students with non-null githubAccessToken
 * 2. Checks if the token is already encrypted (idempotent)
 * 3. Encrypts plaintext tokens using AES-256-GCM
 * 4. Logs progress and errors
 */

async function migrateTokens(): Promise<void> {
  logger.info('Starting GitHub OAuth token encryption migration...');

  // Find all students with GitHub tokens
  const students = await prisma.student.findMany({
    where: {
      githubAccessToken: { not: null },
    },
    select: {
      id: true,
      email: true,
      githubAccessToken: true,
    },
  });

  logger.info(`Found ${students.length} students with GitHub tokens`);

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const student of students) {
    try {
      if (!student.githubAccessToken) continue;

      // Check if already encrypted
      if (isTokenEncrypted(student.githubAccessToken)) {
        skipped++;
        continue;
      }

      // Encrypt the token
      const encryptedToken = encryptToken(student.githubAccessToken);

      // Update the record
      await prisma.student.update({
        where: { id: student.id },
        data: { githubAccessToken: encryptedToken },
      });

      encrypted++;
      if (encrypted % 10 === 0) {
        logger.info(`Progress: ${encrypted} tokens encrypted...`);
      }
    } catch (error) {
      errors++;
      logger.error(`Failed to encrypt token for student ${student.id} (${student.email}):`, error);
    }
  }

  logger.info('Token encryption migration complete.', {
    total: students.length,
    encrypted,
    skipped: `${skipped} already encrypted`,
    errors,
  });

  if (errors > 0) {
    logger.warn(`${errors} tokens could not be encrypted. Check logs for details.`);
  }
}

// Run the migration
migrateTokens()
  .then(() => {
    logger.info('Migration completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration failed:', error);
    process.exit(1);
  });
