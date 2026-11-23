import prisma from '../db/index.js';
import { getEncryptionKeyManager } from '../services/encryptionKeyManager.js';
import logger from '../utils/logger.js';

const ENCRYPTED_MODELS: Record<string, string[]> = {
  Student: ['githubAccessToken', 'email'],
};

async function migrateTable(model: string, fields: string[]): Promise<{ total: number; migrated: number; errors: number }> {
  const ekm = getEncryptionKeyManager();
  const batchSize = 100;
  let offset = 0;
  let total = 0;
  let migrated = 0;
  let errors = 0;

  while (true) {
    const records = await (prisma as any)[model.toLowerCase()].findMany({
      take: batchSize,
      skip: offset,
    });

    if (records.length === 0) break;

    total += records.length;

    for (const record of records) {
      try {
        const updates: Record<string, any> = {};
        let needsUpdate = false;

        for (const field of fields) {
          const value = record[field];
          if (typeof value === 'string' && value.length > 0) {
            try {
              getEncryptionKeyManager().decrypt(value);
            } catch {
              updates[field] = ekm.encrypt(value);
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          await (prisma as any)[model.toLowerCase()].update({
            where: { id: record.id },
            data: updates,
          });
          migrated++;
        }
      } catch (error) {
        errors++;
        logger.error(`Failed to migrate ${model} ${record.id}:`, error);
      }
    }

    offset += batchSize;
  }

  return { total, migrated, errors };
}

async function main() {
  logger.info('Starting key rotation migration...');
  const ekm = getEncryptionKeyManager();
  logger.info(`Active key version: ${ekm.getActiveVersion()}`);

  for (const [model, fields] of Object.entries(ENCRYPTED_MODELS)) {
    logger.info(`Migrating ${model}...`);
    const result = await migrateTable(model, fields);
    logger.info(`${model} migration complete`, result);
  }

  logger.info('Key rotation migration finished.');
  process.exit(0);
}

main().catch((error) => {
  logger.error('Migration failed:', error);
  process.exit(1);
});
