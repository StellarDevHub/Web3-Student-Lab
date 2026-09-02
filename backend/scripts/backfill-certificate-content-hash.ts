/**
 * One-time backfill script for the certificate content-hash integrity
 * feature (see prisma/migrations/20260730000000_certificate_content_hash).
 *
 * The migration adds a nullable `contentHash` column. Certificates
 * minted before this feature shipped have `contentHash = NULL`, which
 * the verification code treats as "unverified" (not tampered) so
 * legacy records are never misreported. Run this script once after
 * deploying the migration to compute and persist a content hash for
 * every existing certificate from its currently stored fields, so
 * future edits to those rows become detectable as tampering.
 *
 * Usage:
 *   npx tsx scripts/backfill-certificate-content-hash.ts
 *
 * This is intentionally a manual, explicit operational step rather
 * than something run automatically on deploy: backfilling asserts
 * that the *current* stored state of each legacy certificate is
 * trustworthy, which is an operational judgment call, not something
 * safe to assume silently.
 */
import prisma from '../src/db/index.js';
import { computeCertificateContentHash } from '../src/certificates/ContentHash.js';
import logger from '../src/utils/logger.js';

async function main(): Promise<void> {
  const certificates = await prisma.certificate.findMany({
    where: { contentHash: null },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      tokenId: true,
      grade: true,
      did: true,
      issuedAt: true,
    },
  });

  logger.info(`Backfilling content hash for ${certificates.length} certificate(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const cert of certificates) {
    try {
      const contentHash = computeCertificateContentHash(cert);
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { contentHash },
      });
      succeeded++;
    } catch (error) {
      failed++;
      logger.error(`Failed to backfill content hash for certificate ${cert.id}`, { error });
    }
  }

  logger.info(`Backfill complete: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    logger.error('Backfill script crashed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
