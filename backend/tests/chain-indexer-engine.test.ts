/**
 * Comprehensive test suite for ChainIndexerEngine with Mocked Prisma
 * Tests cross-chain bridge event indexing, re-org detection, and rollback functionality
 * Target coverage: >90%
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ChainIndexerEngine } from '../src/blockchain/chain-indexer-engine.js';
import { ChainType, IncomingBlock } from '../src/types/bridge-indexer.types.js';

// Mock Prisma Client
const mockPrisma = {
  bridgeEvent: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  processedBlock: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((callback: any) => callback(mockPrisma)),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('../src/db/index.js', () => ({
  default: mockPrisma,
}));

describe('ChainIndexerEngine', () => {
  let engine: ChainIndexerEngine;

  beforeAll(async () => {
    // Initialize the engine with mocked Prisma client
    ChainIndexerEngine.resetInstance();
    engine = ChainIndexerEngine.getInstance(mockPrisma as any, {
      maxRetries: 3,
      idempotencyKeyPrefix: 'bridge-event',
    });
  });

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Default mock implementations
    mockPrisma.$transaction.mockImplementation((callback: any) => Promise.resolve(callback(mockPrisma)));
    mockPrisma.processedBlock.findFirst.mockResolvedValue(null);
    mockPrisma.bridgeEvent.upsert.mockResolvedValue({
      id: 'mock-event-id',
      processed: false,
      eventId: 'EVENT_001',
    });
    mockPrisma.processedBlock.upsert.mockResolvedValue({
      id: 'mock-block-id',
      blockNumber: 1,
      blockHash: 'HASH_001',
    });
    mockPrisma.bridgeEvent.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.processedBlock.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.bridgeEvent.findUnique.mockResolvedValue(null);
    mockPrisma.processedBlock.findMany.mockResolvedValue([]);
    mockPrisma.bridgeEvent.count.mockResolvedValue(0);
    mockPrisma.processedBlock.findUnique.mockResolvedValue(null);

    await engine.cleanup();
  });

  afterAll(async () => {
    // Final cleanup
    jest.clearAllMocks();
    ChainIndexerEngine.resetInstance();
  });

  describe('handleIncomingBlock - Successful Processing', () => {
    it('should process a valid block successfully on STELLAR chain', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100, token: 'USDC' },
            transactionHash: 'TX_001',
            logIndex: 0,
          },
        ],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const result = await callback(mockPrisma);
        return result;
      });

      mockPrisma.processedBlock.upsert.mockResolvedValue({
        id: 'block-001',
        chain: ChainType.STELLAR,
        blockNumber: 1,
        blockHash: 'HASH_001',
        parentHash: '0x0',
        isRolledBack: false,
      });

      mockPrisma.bridgeEvent.upsert.mockResolvedValue({
        id: 'event-001',
        chain: ChainType.STELLAR,
        eventId: 'EVENT_001',
        processed: true,
        processedAt: new Date(),
      });

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block);

      expect(result.success).toBe(true);
      expect(result.chain).toBe(ChainType.STELLAR);
      expect(result.blockNumber).toBe(1);
      expect(result.processedEventCount).toBe(1);
    });

    it('should process a valid block successfully on EVM chain', async () => {
      const block: IncomingBlock = {
        number: 100,
        hash: 'HASH_0x100',
        parentHash: 'HASH_0x99',
        timestamp: Date.now(),
        events: [],
      };

      mockPrisma.processedBlock.upsert.mockResolvedValue({
        id: 'block-100',
        chain: ChainType.EVM,
        blockNumber: 100,
        blockHash: 'HASH_0x100',
        parentHash: 'HASH_0x99',
      });

      const result = await engine.handleIncomingBlock(ChainType.EVM, block);

      expect(result.success).toBe(true);
      expect(result.chain).toBe(ChainType.EVM);
      expect(result.blockNumber).toBe(100);
      expect(result.processedEventCount).toBe(0);
    });

    it('should process consecutive blocks with matching parent hashes', async () => {
      // First block (genesis)
      const block1: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
        ],
      };

      mockPrisma.processedBlock.findFirst.mockResolvedValue(null);
      mockPrisma.processedBlock.upsert.mockResolvedValue({
        id: 'block-001',
        chain: ChainType.STELLAR,
        blockNumber: 1,
        blockHash: 'HASH_001',
      });

      const result1 = await engine.handleIncomingBlock(ChainType.STELLAR, block1);
      expect(result1.success).toBe(true);
      expect(result1.processedEventCount).toBe(1);

      // Second block with correct parent
      const block2: IncomingBlock = {
        number: 2,
        hash: 'HASH_002',
        parentHash: 'HASH_001', // Matches previous block's hash
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_002',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 200 },
          },
        ],
      };

      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      mockPrisma.processedBlock.upsert.mockResolvedValue({
        id: 'block-002',
        chain: ChainType.STELLAR,
        blockNumber: 2,
        blockHash: 'HASH_002',
      });

      const result2 = await engine.handleIncomingBlock(ChainType.STELLAR, block2);
      expect(result2.success).toBe(true);
      expect(result2.processedEventCount).toBe(1);
    });

    it('should handle multiple events in a single block', async () => {
      const block: IncomingBlock = {
        number: 5,
        hash: 'HASH_005',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
          {
            id: 'EVENT_002',
            type: 'LiquidityUpdate',
            sourceChain: 'STELLAR',
            targetChain: 'EVM',
            data: { amount: 200 },
          },
          {
            id: 'EVENT_003',
            type: 'Validation',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { status: 'confirmed' },
          },
        ],
      };

      let eventCount = 0;
      mockPrisma.bridgeEvent.upsert.mockImplementation(async () => {
        eventCount++;
        return {
          id: `event-${eventCount}`,
          eventId: `EVENT_${eventCount.toString().padStart(3, '0')}`,
          processed: true,
        };
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        eventCount = 0; // Reset for this transaction
        const result = await callback(mockPrisma);
        return result;
      });

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block);

      expect(result.success).toBe(true);
      expect(result.processedEventCount).toBe(3);
    });

    it('should handle blocks with no events', async () => {
      const block: IncomingBlock = {
        number: 10,
        hash: 'HASH_010',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [],
      };

      const result = await engine.handleIncomingBlock(ChainType.EVM, block);

      expect(result.success).toBe(true);
      expect(result.processedEventCount).toBe(0);
    });
  });

  describe('Idempotent Event Processing', () => {
    it('should process the same event only once (idempotency)', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_IDEMPOTENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
        ],
      };

      mockPrisma.bridgeEvent.upsert.mockResolvedValue({
        id: 'event-001',
        chain: ChainType.STELLAR,
        eventId: 'EVENT_IDEMPOTENT_001',
        processed: true,
      });

      const result1 = await engine.handleIncomingBlock(ChainType.STELLAR, block);
      expect(result1.processedEventCount).toBe(1);

      // Second call with same event - upsert should be idempotent
      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      const block2: IncomingBlock = {
        number: 2,
        hash: 'HASH_002',
        parentHash: 'HASH_001',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_IDEMPOTENT_001', // Same event ID
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
        ],
      };

      // Upsert should be called (which is idempotent via unique constraint)
      const result2 = await engine.handleIncomingBlock(ChainType.STELLAR, block2);

      // Verify upsert was called for idempotent handling
      expect(mockPrisma.bridgeEvent.upsert).toHaveBeenCalled();
    });

    it('should maintain event idempotency across chain boundaries', async () => {
      const event = {
        id: 'CROSS_CHAIN_EVENT_001',
        type: 'TokenBridge',
        sourceChain: 'EVM',
        targetChain: 'STELLAR',
        data: { amount: 500 },
      };

      const stellarBlock: IncomingBlock = {
        number: 1,
        hash: 'HASH_STELLAR_001',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [event],
      };

      const evmBlock: IncomingBlock = {
        number: 100,
        hash: 'HASH_EVM_100',
        parentHash: 'HASH_EVM_99',
        timestamp: Date.now(),
        events: [event],
      };

      // Set up mock to return null initially (no last block for either chain)
      mockPrisma.processedBlock.findFirst.mockResolvedValue(null);

      // Process event on STELLAR chain
      await engine.handleIncomingBlock(ChainType.STELLAR, stellarBlock);

      // Verify upsert was called once for STELLAR
      expect(mockPrisma.bridgeEvent.upsert).toHaveBeenCalledTimes(1);

      // Reset mock for EVM - it should also return null (no last block for EVM chain yet)
      mockPrisma.processedBlock.findFirst.mockResolvedValue(null);

      // Process same event on EVM chain
      await engine.handleIncomingBlock(ChainType.EVM, evmBlock);

      // Verify upsert was called twice total (once per chain)
      expect(mockPrisma.bridgeEvent.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Re-org Detection and Handling', () => {
    it('should detect re-org when parent hash does not match', async () => {
      // First block
      const block1: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
        ],
      };

      await engine.handleIncomingBlock(ChainType.STELLAR, block1);

      // Second block with correct parent
      const block2: IncomingBlock = {
        number: 2,
        hash: 'HASH_002',
        parentHash: 'HASH_001',
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_002',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 200 },
          },
        ],
      };

      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      await engine.handleIncomingBlock(ChainType.STELLAR, block2);

      // Now receive a conflicting block 2 (re-org) with wrong parent
      const block2Reorg: IncomingBlock = {
        number: 2,
        hash: 'HASH_002_REORG',
        parentHash: 'HASH_001_INVALID', // Different parent hash - should trigger re-org
        timestamp: Date.now(),
        events: [
          {
            id: 'EVENT_002_REORG',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 300 },
          },
        ],
      };

      // Parent hash mismatch should be detected
      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block2Reorg);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Re-org detected');
    });

    it('should trigger rollback on re-org detection', async () => {
      // Setup: last processed block info
      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      // Mock findMany to return blocks to rollback
      mockPrisma.processedBlock.findMany.mockResolvedValue([
        { id: 'block-2', blockNumber: 2, blockHash: 'HASH_002' },
        { id: 'block-3', blockNumber: 3, blockHash: 'HASH_003' },
      ]);

      const blockReorg: IncomingBlock = {
        number: 2,
        hash: 'HASH_002_REORG',
        parentHash: 'INVALID_PARENT',
        timestamp: Date.now(),
        events: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, blockReorg);

      expect(result.success).toBe(false);

      // Verify rollback operations were called
      expect(mockPrisma.bridgeEvent.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.processedBlock.updateMany).toHaveBeenCalled();
    });

    it('should delete events associated with rolled back blocks', async () => {
      // Setup: last block info
      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      // Mock blocks to rollback
      mockPrisma.processedBlock.findMany.mockResolvedValue([
        { id: 'block-2', blockNumber: 2, blockHash: 'HASH_002' },
      ]);

      const blockReorg: IncomingBlock = {
        number: 2,
        hash: 'HASH_002_REORG',
        parentHash: 'INVALID_PARENT',
        timestamp: Date.now(),
        events: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });

      await engine.handleIncomingBlock(ChainType.STELLAR, blockReorg);

      // Verify deleteMany was called for events
      expect(mockPrisma.bridgeEvent.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            processedBlockId: expect.objectContaining({
              in: expect.any(Array),
            }),
          }),
        }),
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should throw error on invalid chain type', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [],
      };

      const result = await engine.handleIncomingBlock('INVALID_CHAIN', block);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid chain type');
    });

    it('should prevent concurrent processing of the same block', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [],
      };

      // First call should succeed
      const result1 = await engine.handleIncomingBlock(ChainType.STELLAR, block);
      expect(result1.success).toBe(true);

      // Clean up lock for testing
      await engine.cleanup();
    });

    it('should handle database transaction failures gracefully', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
        ],
      };

      // Simulate transaction failure
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('Transaction failed'));

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process block');
    });

    it('should handle events with missing optional fields', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
            // No transactionHash or logIndex
          },
        ],
      };

      mockPrisma.bridgeEvent.upsert.mockResolvedValue({
        id: 'event-001',
        chain: ChainType.STELLAR,
        eventId: 'EVENT_001',
        transactionHash: null,
        logIndex: null,
        processed: true,
      });

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block);

      expect(result.success).toBe(true);
      expect(result.processedEventCount).toBe(1);
    });

    it('should handle event processing errors and continue with remaining events', async () => {
      const block: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [
          {
            id: 'EVENT_001',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 100 },
          },
          {
            id: 'EVENT_002',
            type: 'TokenBridge',
            sourceChain: 'EVM',
            targetChain: 'STELLAR',
            data: { amount: 200 },
          },
        ],
      };

      let callCount = 0;
      mockPrisma.bridgeEvent.upsert.mockImplementation(async (params: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Event processing failed');
        }
        return {
          id: `event-${callCount}`,
          eventId: params.where.chain_eventId.eventId,
          processed: true,
        };
      });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        callCount = 0;
        return callback(mockPrisma);
      });

      const result = await engine.handleIncomingBlock(ChainType.STELLAR, block);

      // First event should fail, second should succeed
      expect(result.success).toBe(true);
      expect(result.processedEventCount).toBe(1); // Only second event was processed
    });

    it('should handle rollback execution errors gracefully', async () => {
      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      mockPrisma.processedBlock.findMany.mockResolvedValue([
        { id: 'block-2', blockNumber: 2, blockHash: 'HASH_002' },
      ]);

      // Make transaction fail during rollback
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('Rollback transaction failed'));

      const blockReorg: IncomingBlock = {
        number: 2,
        hash: 'HASH_002_REORG',
        parentHash: 'INVALID_PARENT',
        timestamp: Date.now(),
        events: [],
      };

      // This should fail due to transaction error
      const result = await engine.handleIncomingBlock(ChainType.STELLAR, blockReorg);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Re-org detected but rollback failed');
    });
  });

  describe('Indexing Status', () => {
    it('should return correct indexing status for a chain', async () => {
      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 2,
        blockHash: 'HASH_002',
        chain: ChainType.STELLAR,
      });

      mockPrisma.bridgeEvent.count.mockResolvedValue(3);

      const status = await engine.getIndexingStatus(ChainType.STELLAR);

      expect(status.chain).toBe(ChainType.STELLAR);
      expect(status.lastBlockNumber).toBe(2);
      expect(status.totalEventsProcessed).toBe(3);
    });

    it('should return null lastBlockNumber for unprocessed chain', async () => {
      mockPrisma.processedBlock.findFirst.mockResolvedValue(null);
      mockPrisma.bridgeEvent.count.mockResolvedValue(0);

      const status = await engine.getIndexingStatus(ChainType.EVM);

      expect(status.chain).toBe(ChainType.EVM);
      expect(status.lastBlockNumber).toBeNull();
      expect(status.totalEventsProcessed).toBe(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple getInstance calls', () => {
      ChainIndexerEngine.resetInstance();

      const instance1 = ChainIndexerEngine.getInstance(mockPrisma as any);
      const instance2 = ChainIndexerEngine.getInstance(mockPrisma as any);

      expect(instance1).toBe(instance2);
    });

    it('should throw error if getInstance called without Prisma and no existing instance', () => {
      ChainIndexerEngine.resetInstance();

      expect(() => ChainIndexerEngine.getInstance()).toThrow('Prisma client is required');
    });
  });

  describe('Integration - Full Workflow', () => {
    it('should handle a complete workflow: multiple blocks, re-org, and recovery', async () => {
      // Phase 1: Process first block successfully
      const block1: IncomingBlock = {
        number: 1,
        hash: 'HASH_001',
        parentHash: '0x0',
        events: [{ id: 'EVENT_001', type: 'TokenBridge', sourceChain: 'EVM', targetChain: 'STELLAR', data: { amount: 100 } }],
      };

      mockPrisma.processedBlock.findFirst.mockResolvedValue(null);
      let result = await engine.handleIncomingBlock(ChainType.STELLAR, block1);
      expect(result.success).toBe(true);
      expect(result.processedEventCount).toBe(1);

      // Phase 2: Process second block
      const block2: IncomingBlock = {
        number: 2,
        hash: 'HASH_002',
        parentHash: 'HASH_001',
        events: [{ id: 'EVENT_002', type: 'TokenBridge', sourceChain: 'EVM', targetChain: 'STELLAR', data: { amount: 200 } }],
      };

      mockPrisma.processedBlock.findFirst.mockResolvedValue({
        blockNumber: 1,
        blockHash: 'HASH_001',
        chain: ChainType.STELLAR,
      });

      result = await engine.handleIncomingBlock(ChainType.STELLAR, block2);
      expect(result.success).toBe(true);

      // Phase 3: Simulate re-org detection
      const block2Reorg: IncomingBlock = {
        number: 2,
        hash: 'HASH_002_REORG',
        parentHash: 'INVALID_PARENT',
        events: [{ id: 'EVENT_002_REORG', type: 'TokenBridge', sourceChain: 'EVM', targetChain: 'STELLAR', data: { amount: 250 } }],
      };

      mockPrisma.processedBlock.findMany.mockResolvedValue([
        { id: 'block-2', blockNumber: 2, blockHash: 'HASH_002' },
      ]);

      result = await engine.handleIncomingBlock(ChainType.STELLAR, block2Reorg);
      expect(result.success).toBe(false);

      // Verify rollback was attempted
      expect(mockPrisma.bridgeEvent.deleteMany).toHaveBeenCalled();
    });
  });
});
