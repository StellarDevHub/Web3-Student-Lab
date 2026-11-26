import prisma from '../db/index.js';
import { computeRowHash, GENESIS_HASH } from '../utils/audit.js';
import { computeMerkleRoot } from '../jobs/anchorMerkleRootJob.js';
import logger from '../utils/logger.js';

export interface TamperedRowReport {
  id: string;
  action: string;
  userEmail?: string | null;
  createdAt: Date;
  storedHash: string | null;
  expectedHash: string;
  reason: 'HASH_MISMATCH' | 'MISSING_HASH';
}

export interface BrokenChainReport {
  id: string;
  storedPrevHash: string | null;
  expectedPrevHash: string;
  reason: 'BROKEN_LINK';
}

export interface AnchorMismatchReport {
  anchorId: string;
  periodStart: Date;
  periodEnd: Date;
  storedMerkleRoot: string;
  recomputedMerkleRoot: string;
  logCount: number;
  transactionHash: string;
}

export interface VerificationResult {
  valid: boolean;
  totalLogsChecked: number;
  totalAnchorsChecked: number;
  tamperedRows: TamperedRowReport[];
  brokenChains: BrokenChainReport[];
  anchorMismatches: AnchorMismatchReport[];
  verifiedAt: Date;
  message: string;
}

/**
 * Automates complete cryptographic verification of the audit log hash-chain
 * and all daily anchored Merkle roots.
 */
export async function verifyAuditChain(options?: {
  fromDate?: Date;
  toDate?: Date;
}): Promise<VerificationResult> {
  const whereClause: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (options?.fromDate || options?.toDate) {
    whereClause.createdAt = {};
    if (options.fromDate) whereClause.createdAt.gte = options.fromDate;
    if (options.toDate) whereClause.createdAt.lte = options.toDate;
  }

  const logs = await prisma.auditLog.findMany({
    where: whereClause,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const tamperedRows: TamperedRowReport[] = [];
  const brokenChains: BrokenChainReport[] = [];
  const anchorMismatches: AnchorMismatchReport[] = [];

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // 1. Check prevHash linkage
    const actualPrevHash = log.prevHash || GENESIS_HASH;
    if (actualPrevHash !== expectedPrevHash) {
      brokenChains.push({
        id: log.id,
        storedPrevHash: log.prevHash,
        expectedPrevHash,
        reason: 'BROKEN_LINK',
      });
    }

    // 2. Recompute row hash
    const recomputedHash = computeRowHash(
      {
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        userId: log.userId,
        userEmail: log.userEmail,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      },
      actualPrevHash
    );

    if (!log.hash) {
      tamperedRows.push({
        id: log.id,
        action: log.action,
        userEmail: log.userEmail,
        createdAt: log.createdAt,
        storedHash: null,
        expectedHash: recomputedHash,
        reason: 'MISSING_HASH',
      });
    } else if (log.hash !== recomputedHash) {
      tamperedRows.push({
        id: log.id,
        action: log.action,
        userEmail: log.userEmail,
        createdAt: log.createdAt,
        storedHash: log.hash,
        expectedHash: recomputedHash,
        reason: 'HASH_MISMATCH',
      });
    }

    // Advance chain expectation to current log's hash (or recomputed if missing)
    expectedPrevHash = log.hash || recomputedHash;
  }

  // 3. Verify all Merkle anchors
  const anchors = await prisma.merkleAnchor.findMany({
    orderBy: { periodStart: 'asc' },
  });

  for (const anchor of anchors) {
    const anchorLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: anchor.periodStart,
          lte: anchor.periodEnd,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const leaves = anchorLogs
      .map((l) => l.hash)
      .filter((h): h is string => Boolean(h && h.length === 64));

    const recomputedRoot = computeMerkleRoot(leaves);

    if (recomputedRoot !== anchor.merkleRoot) {
      anchorMismatches.push({
        anchorId: anchor.id,
        periodStart: anchor.periodStart,
        periodEnd: anchor.periodEnd,
        storedMerkleRoot: anchor.merkleRoot,
        recomputedMerkleRoot: recomputedRoot,
        logCount: anchorLogs.length,
        transactionHash: anchor.transactionHash,
      });
    }
  }

  const valid =
    tamperedRows.length === 0 && brokenChains.length === 0 && anchorMismatches.length === 0;

  const message = valid
    ? `All ${logs.length} audit logs form an unbroken cryptographic hash-chain and match all ${anchors.length} Stellar Merkle anchors.`
    : `Cryptographic audit integrity violation detected: ${tamperedRows.length} tampered rows, ${brokenChains.length} broken chain links, ${anchorMismatches.length} Merkle anchor mismatches.`;

  return {
    valid,
    totalLogsChecked: logs.length,
    totalAnchorsChecked: anchors.length,
    tamperedRows,
    brokenChains,
    anchorMismatches,
    verifiedAt: new Date(),
    message,
  };
}

/**
 * CLI runner for verifyAuditChain script
 */
async function runCLI(): Promise<void> {
  console.log('=====================================================');
  console.log('   Audit Log Cryptographic Hash-Chain Verification   ');
  console.log('=====================================================');

  try {
    const result = await verifyAuditChain();

    console.log(`Total Logs Checked    : ${result.totalLogsChecked}`);
    console.log(`Total Anchors Checked : ${result.totalAnchorsChecked}`);
    console.log(`Chain Integrity Valid : ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`Summary Message       : ${result.message}`);

    if (result.tamperedRows.length > 0) {
      console.error('\n[!] TAMPERED ROWS DETECTED:');
      console.table(result.tamperedRows);
    }

    if (result.brokenChains.length > 0) {
      console.error('\n[!] BROKEN CHAIN LINKS DETECTED:');
      console.table(result.brokenChains);
    }

    if (result.anchorMismatches.length > 0) {
      console.error('\n[!] MERKLE ANCHOR MISMATCHES DETECTED:');
      console.table(result.anchorMismatches);
    }

    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Verification script failed with runtime error:', error);
    console.error('Fatal error running verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('verifyAuditChain.ts');

if (isMainModule) {
  runCLI();
}
