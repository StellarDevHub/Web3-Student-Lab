import { prisma } from '../src/db/index.js';
import { getEncryptionKeyManager } from '../src/services/encryptionKeyManager.js';
import logger from '../src/utils/logger.js';

const BATCH_SIZE = 100;
const ENCRYPTED_FIELDS = ['email', 'githubAccessToken'] as const;

async function rotateStudentFields(): Promise<{ scanned: number; migrated: number; errors: number }> {
  const keyManager = getEncryptionKeyManager();
  let cursor: string | undefined;
  let scanned = 0;
  let migrated = 0;
  let errors = 0;

  while (true) {
    const records = await prisma.student.findMany({
      ...(cursor ? { where: { id: { gt: cursor } } } : {}),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        email: true,
        githubAccessToken: true,
      },
    });

    if (records.length === 0) break;
    cursor = records[records.length - 1]!.id;
    scanned += records.length;

    for (const record of records) {
      const updates: { email?: string; githubAccessToken?: string } = {};
      const unchangedValues: { email?: string; githubAccessToken?: string | null } = {};

      for (const field of ENCRYPTED_FIELDS) {
        const value = record[field];
        if (typeof value !== 'string' || value.length === 0) continue;

        try {
          const result = keyManager.rotateEnvelope(value);
          if (result.migrated) {
            updates[field] = result.newEnvelope;
            unchangedValues[field] = value;
          }
        } catch (error) {
          errors++;
          logger.error(`Failed to rotate Student.${field} for record ${record.id}:`, error);
        }
      }

      if (Object.keys(updates).length === 0) continue;

      try {
        const result = await prisma.student.updateMany({
          where: { id: record.id, ...unchangedValues },
          data: updates,
        });
        if (result.count > 0) migrated++;
      } catch (error) {
        errors++;
        logger.error(`Failed to persist rotated fields for Student ${record.id}:`, error);
      }
    }

    logger.info('Key rotation batch complete', { scanned, migrated, errors });
  }

  return { scanned, migrated, errors };
}

async function main(): Promise<void> {
  try {
    const keyManager = getEncryptionKeyManager();
    logger.info('Starting encrypted field key rotation', {
      activeKeyVersion: keyManager.getActiveVersion(),
      batchSize: BATCH_SIZE,
    });

    const result = await rotateStudentFields();
    logger.info('Encrypted field key rotation finished', result);
    if (result.errors > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Encrypted field key rotation failed:', error);
  process.exitCode = 1;
});
