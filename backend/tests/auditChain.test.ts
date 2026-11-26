import crypto from 'crypto';
import { computeRowHash, canonicalize, GENESIS_HASH } from '../src/utils/audit.js';
import {
  computeMerkleRoot,
  generateMerkleProof,
  verifyMerkleProof,
  anchorDailyAuditLogs,
} from '../src/jobs/anchorMerkleRootJob.js';
import { verifyAuditChain } from '../src/scripts/verifyAuditChain.js';
import prisma from '../src/db/index.js';

jest.mock('../src/db/index.js', () => {
  return {
    __esModule: true,
    default: {
      auditLog: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      merkleAnchor: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $disconnect: jest.fn(),
    },
    prisma: {
      auditLog: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      merkleAnchor: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $disconnect: jest.fn(),
    },
  };
});

describe('Audit Log Cryptographic Hash-Chain & Merkle Anchoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Canonical Serialization & Hash Computation', () => {
    it('canonicalize sorts keys deterministically regardless of insertion order', () => {
      const obj1 = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const obj2 = { a: 2, m: { a: 4, b: 3 }, z: 1 };

      expect(canonicalize(obj1)).toBe(canonicalize(obj2));
      expect(canonicalize(obj1)).toBe('{"a":2,"m":{"a":4,"b":3},"z":1}');
    });

    it('computeRowHash produces deterministic 64-char hex SHA-256 hash', () => {
      const row = {
        action: 'UPDATE_GRADE',
        entity: 'Certificate',
        entityId: 'cert-123',
        userId: 'admin-1',
        userEmail: 'admin@web3studentlab.org',
        details: { courseId: 'course-1', oldGrade: 'B', newGrade: 'A' },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/Test',
        createdAt: '2026-04-01T00:00:00.000Z',
      };

      const hash1 = computeRowHash(row, GENESIS_HASH);
      const hash2 = computeRowHash(row, GENESIS_HASH);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changing any data field changes the computed hash', () => {
      const baseRow = {
        action: 'UPDATE_GRADE',
        entity: 'Certificate',
        entityId: 'cert-123',
        userId: 'admin-1',
        userEmail: 'admin@web3studentlab.org',
        details: { oldGrade: 'B', newGrade: 'A' },
        createdAt: '2026-04-01T00:00:00.000Z',
      };

      const originalHash = computeRowHash(baseRow, GENESIS_HASH);

      // Tamper with newGrade
      const tamperedDetails = {
        ...baseRow,
        details: { oldGrade: 'B', newGrade: 'A+' },
      };
      expect(computeRowHash(tamperedDetails, GENESIS_HASH)).not.toBe(originalHash);

      // Tamper with action
      const tamperedAction = { ...baseRow, action: 'REVOKE_CERTIFICATE' };
      expect(computeRowHash(tamperedAction, GENESIS_HASH)).not.toBe(originalHash);

      // Tamper with prevHash
      const differentPrevHash = '1'.repeat(64);
      expect(computeRowHash(baseRow, differentPrevHash)).not.toBe(originalHash);
    });
  });

  describe('2. Binary Merkle Tree & Inclusion Proofs', () => {
    it('handles empty leaves list gracefully', () => {
      const root = computeMerkleRoot([]);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns the single leaf when only 1 leaf exists', () => {
      const leaf = crypto.createHash('sha256').update('leaf-1').digest('hex');
      expect(computeMerkleRoot([leaf])).toBe(leaf);
    });

    it('computes correct binary Merkle root for even and odd leaf counts', () => {
      const l1 = crypto.createHash('sha256').update('1').digest('hex');
      const l2 = crypto.createHash('sha256').update('2').digest('hex');
      const l3 = crypto.createHash('sha256').update('3').digest('hex');

      // Even count (2 leaves)
      const expectedRoot2 = crypto
        .createHash('sha256')
        .update(l1 + l2)
        .digest('hex');
      expect(computeMerkleRoot([l1, l2])).toBe(expectedRoot2);

      // Odd count (3 leaves: l3 duplicated to make even pair)
      const parent1 = crypto
        .createHash('sha256')
        .update(l1 + l2)
        .digest('hex');
      const parent2 = crypto
        .createHash('sha256')
        .update(l3 + l3)
        .digest('hex');
      const expectedRoot3 = crypto
        .createHash('sha256')
        .update(parent1 + parent2)
        .digest('hex');
      expect(computeMerkleRoot([l1, l2, l3])).toBe(expectedRoot3);
    });

    it('generates verifiable Merkle inclusion proofs for all leaves', () => {
      const leaves = Array.from({ length: 5 }, (_, i) =>
        crypto.createHash('sha256').update(`entry-${i}`).digest('hex')
      );
      const root = computeMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateMerkleProof(leaves, i);
        const isValid = verifyMerkleProof(leaves[i], proof, root);
        expect(isValid).toBe(true);
      }
    });

    it('rejects proofs when leaf or proof hash is tampered', () => {
      const leaves = Array.from({ length: 4 }, (_, i) =>
        crypto.createHash('sha256').update(`item-${i}`).digest('hex')
      );
      const root = computeMerkleRoot(leaves);

      const proof = generateMerkleProof(leaves, 0);
      const fakeLeaf = crypto.createHash('sha256').update('tampered').digest('hex');

      expect(verifyMerkleProof(fakeLeaf, proof, root)).toBe(false);
    });
  });

  describe('3. Hash-Chain Verification & Tamper Detection', () => {
    it('verifies a valid unbroken chain of audit logs', async () => {
      const log1CreatedAt = new Date('2026-04-01T10:00:00Z');
      const log1Row = {
        action: 'MINT_CERTIFICATE',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: 'admin-1',
        userEmail: 'admin@web3.org',
        details: { grade: 'A' },
        ipAddress: '10.0.0.1',
        userAgent: 'browser',
        createdAt: log1CreatedAt,
      };
      const log1Hash = computeRowHash(log1Row, GENESIS_HASH);

      const log2CreatedAt = new Date('2026-04-01T11:00:00Z');
      const log2Row = {
        action: 'UPDATE_GRADE',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: 'admin-1',
        userEmail: 'admin@web3.org',
        details: { oldGrade: 'A', newGrade: 'A+' },
        ipAddress: '10.0.0.1',
        userAgent: 'browser',
        createdAt: log2CreatedAt,
      };
      const log2Hash = computeRowHash(log2Row, log1Hash);

      const mockLogs = [
        {
          id: 'log-1',
          ...log1Row,
          prevHash: GENESIS_HASH,
          hash: log1Hash,
        },
        {
          id: 'log-2',
          ...log2Row,
          prevHash: log1Hash,
          hash: log2Hash,
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.merkleAnchor.findMany as jest.Mock).mockResolvedValue([]);

      const result = await verifyAuditChain();

      expect(result.valid).toBe(true);
      expect(result.totalLogsChecked).toBe(2);
      expect(result.tamperedRows).toHaveLength(0);
      expect(result.brokenChains).toHaveLength(0);
    });

    it('detects and flags retroactively altered database rows (tampered grade)', async () => {
      const log1CreatedAt = new Date('2026-04-01T10:00:00Z');
      const log1Row = {
        action: 'UPDATE_GRADE',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: 'admin-1',
        userEmail: 'admin@web3.org',
        details: { originalGrade: 'B' },
        ipAddress: '10.0.0.1',
        userAgent: 'browser',
        createdAt: log1CreatedAt,
      };
      const log1Hash = computeRowHash(log1Row, GENESIS_HASH);

      // Insider tamper: database row modified from B to A without updating hash
      const tamperedLogs = [
        {
          id: 'log-tampered',
          ...log1Row,
          details: { originalGrade: 'A' }, // TAMPERED!
          prevHash: GENESIS_HASH,
          hash: log1Hash,
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(tamperedLogs);
      (prisma.merkleAnchor.findMany as jest.Mock).mockResolvedValue([]);

      const result = await verifyAuditChain();

      expect(result.valid).toBe(false);
      expect(result.tamperedRows).toHaveLength(1);
      expect(result.tamperedRows[0].id).toBe('log-tampered');
      expect(result.tamperedRows[0].reason).toBe('HASH_MISMATCH');
    });

    it('detects broken hash-chain when an intermediate record is deleted or prevHash altered', async () => {
      const log1CreatedAt = new Date('2026-04-01T10:00:00Z');
      const log1Row = {
        action: 'MINT',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: null,
        userEmail: null,
        details: null,
        ipAddress: null,
        userAgent: null,
        createdAt: log1CreatedAt,
      };
      const log1Hash = computeRowHash(log1Row, GENESIS_HASH);

      const log3CreatedAt = new Date('2026-04-01T12:00:00Z');
      const log3Row = {
        action: 'REVOKE',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: null,
        userEmail: null,
        details: null,
        ipAddress: null,
        userAgent: null,
        createdAt: log3CreatedAt,
      };
      const fakePrevHash = '2'.repeat(64);
      const log3Hash = computeRowHash(log3Row, fakePrevHash);

      // In DB, log2 was deleted, so log3.prevHash does not match log1.hash
      const brokenLogs = [
        {
          id: 'log-1',
          ...log1Row,
          prevHash: GENESIS_HASH,
          hash: log1Hash,
        },
        {
          id: 'log-3',
          ...log3Row,
          prevHash: fakePrevHash,
          hash: log3Hash,
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(brokenLogs);
      (prisma.merkleAnchor.findMany as jest.Mock).mockResolvedValue([]);

      const result = await verifyAuditChain();

      expect(result.valid).toBe(false);
      expect(result.brokenChains).toHaveLength(1);
      expect(result.brokenChains[0].id).toBe('log-3');
      expect(result.brokenChains[0].storedPrevHash).toBe(fakePrevHash);
      expect(result.brokenChains[0].expectedPrevHash).toBe(log1Hash);
    });

    it('detects Merkle anchor mismatch when anchored period entries are tampered', async () => {
      const date = new Date('2026-04-01T10:00:00Z');
      const log = {
        id: 'log-1',
        action: 'MINT',
        entity: 'Certificate',
        entityId: 'cert-1',
        userId: null,
        userEmail: null,
        details: null,
        ipAddress: null,
        userAgent: null,
        createdAt: date,
        prevHash: GENESIS_HASH,
        hash: 'a'.repeat(64),
      };

      const anchor = {
        id: 'anchor-1',
        merkleRoot: 'b'.repeat(64), // Mismatch with actual computed root ('a'.repeat(64))
        prevMerkleRoot: null,
        periodStart: new Date('2026-04-01T00:00:00Z'),
        periodEnd: new Date('2026-04-01T23:59:59Z'),
        logCount: 1,
        transactionHash: '0xmocktx123456',
        contractAddress: 'CDERTIFICATE123',
        network: 'stellar-testnet',
        status: 'ANCHORED',
        anchoredAt: new Date(),
        metadata: null,
      };

      (prisma.auditLog.findMany as jest.Mock)
        .mockResolvedValueOnce([log]) // initial walk
        .mockResolvedValueOnce([log]); // anchor period query
      (prisma.merkleAnchor.findMany as jest.Mock).mockResolvedValue([anchor]);

      const result = await verifyAuditChain();

      expect(result.valid).toBe(false);
      expect(result.anchorMismatches).toHaveLength(1);
      expect(result.anchorMismatches[0].anchorId).toBe('anchor-1');
      expect(result.anchorMismatches[0].storedMerkleRoot).toBe('b'.repeat(64));
      expect(result.anchorMismatches[0].recomputedMerkleRoot).toBe('a'.repeat(64));
    });
  });

  describe('4. Daily Merkle Anchoring Job', () => {
    it('anchors daily audit logs and creates a verifiable MerkleAnchor record', async () => {
      const logs = [
        {
          id: 'log-1',
          hash: crypto.createHash('sha256').update('entry-1').digest('hex'),
          createdAt: new Date(),
        },
        {
          id: 'log-2',
          hash: crypto.createHash('sha256').update('entry-2').digest('hex'),
          createdAt: new Date(),
        },
      ];

      const expectedRoot = computeMerkleRoot(logs.map((l) => l.hash));

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(logs);
      (prisma.merkleAnchor.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.merkleAnchor.create as jest.Mock).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'anchor-new',
          ...data,
        })
      );

      const anchor = await anchorDailyAuditLogs({
        periodStart: new Date('2026-04-01T00:00:00Z'),
        periodEnd: new Date('2026-04-01T23:59:59Z'),
      });

      expect(anchor.merkleRoot).toBe(expectedRoot);
      expect(anchor.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(anchor.logCount).toBe(2);
      expect(prisma.merkleAnchor.create).toHaveBeenCalled();
    });
  });
});
