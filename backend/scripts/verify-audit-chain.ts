import prisma from '../src/db/index.js';
import { createHash } from 'crypto';

function buildChainInput(
  prevHash: string | undefined,
  timestamp: string,
  userId: string | null | undefined,
  action: string,
  payload: Record<string, unknown>
): string {
  return [
    prevHash ?? '',
    timestamp,
    userId ?? '',
    action,
    JSON.stringify(payload),
  ].join('\x00');
}

async function verifyAuditChain(): Promise<void> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
  });

  let prevHash: string | undefined = undefined;
  let broken = false;

  for (const log of logs) {
    const payload = {
      userEmail: log.userEmail,
      entity: log.entity,
      entityId: log.entityId,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
    };

    const chainInput = buildChainInput(prevHash, log.createdAt.toISOString(), log.userId, log.action, payload);
    const expectedHash = createHash('sha256').update(chainInput, 'utf8').digest('hex');

    if (log.prevHash !== prevHash) {
      console.error(`BROKEN CHAIN at ${log.id}: expected prevHash=${prevHash ?? 'null'}, got ${log.prevHash ?? 'null'}`);
      broken = true;
    }

    const details = log.details as Record<string, string> | null;
    if (details?._hash !== expectedHash) {
      console.error(`TAMPERED HASH at ${log.id}: expected ${expectedHash}, got ${details?._hash ?? 'undefined'}`);
      broken = true;
    }

    prevHash = expectedHash;
  }

  if (broken) {
    console.error(`Audit chain verification failed: ${logs.length} records scanned.`);
    process.exitCode = 1;
  } else {
    console.log(`Audit chain verified: ${logs.length} records intact.`);
  }
}

verifyAuditChain().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
