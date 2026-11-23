import crypto from 'crypto';
import prisma from '../db/index.js';
import { certificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import logger from '../utils/logger.js';
import { GENESIS_HASH } from '../utils/audit.js';

export interface MerkleProofNode {
  position: 'left' | 'right';
  hash: string;
}

/**
 * Computes a standard binary SHA-256 Merkle root from an array of 32-byte hex hashes.
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return crypto.createHash('sha256').update(GENESIS_HASH).digest('hex');
  }

  if (leaves.length === 1) {
    return leaves[0];
  }

  let currentLevel = [...leaves];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // duplicate odd leaf

      const combined = crypto
        .createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

/**
 * Generates a Merkle inclusion proof for a leaf at the given index.
 */
export function generateMerkleProof(leaves: string[], targetIndex: number): MerkleProofNode[] {
  if (targetIndex < 0 || targetIndex >= leaves.length) {
    throw new Error(`Invalid leaf index: ${targetIndex}`);
  }

  const proof: MerkleProofNode[] = [];
  let currentLevel = [...leaves];
  let currentIndex = targetIndex;

  while (currentLevel.length > 1) {
    const isRightNode = currentIndex % 2 === 1;
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

    if (siblingIndex < currentLevel.length) {
      proof.push({
        position: isRightNode ? 'left' : 'right',
        hash: currentLevel[siblingIndex],
      });
    } else {
      // Odd node duplicated
      proof.push({
        position: 'right',
        hash: currentLevel[currentIndex],
      });
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const combined = crypto
        .createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verifies a Merkle inclusion proof against a known Merkle root.
 */
export function verifyMerkleProof(
  leaf: string,
  proof: MerkleProofNode[],
  expectedRoot: string
): boolean {
  let currentHash = leaf;

  for (const node of proof) {
    const left = node.position === 'left' ? node.hash : currentHash;
    const right = node.position === 'right' ? node.hash : currentHash;
    currentHash = crypto
      .createHash('sha256')
      .update(left + right)
      .digest('hex');
  }

  return currentHash === expectedRoot;
}

export interface AnchorOptions {
  periodStart?: Date;
  periodEnd?: Date;
  force?: boolean;
}

/**
 * Computes the 32-byte Merkle root for audit log entries across the specified period
 * (defaults to previous 24 hours) and anchors the root into the Soroban Certificate contract on Stellar.
 */
export async function anchorDailyAuditLogs(options?: AnchorOptions) {
  const periodEnd = options?.periodEnd || new Date();
  const periodStart = options?.periodStart || new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  logger.info(
    `[anchorDailyAuditLogs] Preparing audit log anchoring for window: ${periodStart.toISOString()} -> ${periodEnd.toISOString()}`
  );

  // Fetch all audit logs in this 24h window ordered chronologically
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const leaves = logs
    .map((log) => log.hash)
    .filter((h): h is string => Boolean(h && h.length === 64));

  const merkleRoot = computeMerkleRoot(leaves);

  // Fetch previous anchor to form an anchor chain
  const previousAnchor = await prisma.merkleAnchor.findFirst({
    orderBy: { anchoredAt: 'desc' },
  });

  // Call Stellar/Soroban anchoring service
  const anchorResult = await certificateBlockchainService.anchorAuditMerkleRoot(
    merkleRoot,
    periodEnd
  );

  // Persist anchor record
  const savedAnchor = await prisma.merkleAnchor.create({
    data: {
      merkleRoot,
      prevMerkleRoot: previousAnchor?.merkleRoot || null,
      periodStart,
      periodEnd,
      logCount: logs.length,
      transactionHash: anchorResult.transactionHash,
      contractAddress: anchorResult.contractAddress,
      network: process.env.STELLAR_NETWORK || 'stellar-testnet',
      status: 'ANCHORED',
      anchoredAt: anchorResult.anchoredAt,
      metadata: {
        ledgerSequence: anchorResult.ledgerSequence,
        firstLogId: logs[0]?.id || null,
        lastLogId: logs[logs.length - 1]?.id || null,
      },
    },
  });

  logger.info(
    `[anchorDailyAuditLogs] Successfully anchored Merkle root ${merkleRoot} with tx ${anchorResult.transactionHash} (${logs.length} entries)`
  );

  return savedAnchor;
}

/**
 * Standalone job runner intended for 24-hour cron invocation
 */
export async function runAnchorMerkleRootJob(): Promise<void> {
  try {
    const anchor = await anchorDailyAuditLogs();
    logger.info(`Anchor Merkle Root Job completed successfully. Anchor ID: ${anchor.id}`);
  } catch (error) {
    logger.error('Anchor Merkle Root Job failed:', error);
    throw error;
  }
}

// Auto-run if executed directly via node/tsx
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('anchorMerkleRootJob.ts');

if (isMainModule) {
  runAnchorMerkleRootJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
