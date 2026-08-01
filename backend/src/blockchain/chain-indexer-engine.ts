/**
 * Cross-Chain Bridge Event Indexer Engine
 * Handles block indexing, event processing, and re-org detection for dual-chain bridges
 */

import { PrismaClient } from '@prisma/client';
import {
    BlockProcessingResult,
    BridgeEventData,
    ChainIndexerConfig,
    ChainType,
    IncomingBlock,
    LastProcessedBlockInfo
} from '../types/bridge-indexer.types.js';

/**
 * Singleton class for managing cross-chain bridge event indexing
 * Ensures exactly-once processing semantics through idempotent event tracking
 */
export class ChainIndexerEngine {
  private static instance: ChainIndexerEngine;
  private prisma: PrismaClient;
  private config: Required<ChainIndexerConfig>;
  private processingLocks: Map<string, boolean> = new Map();

  private constructor(prisma: PrismaClient, config?: ChainIndexerConfig) {
    this.prisma = prisma;
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      idempotencyKeyPrefix: config?.idempotencyKeyPrefix ?? 'bridge-event',
    };
  }

  /**
   * Get singleton instance of ChainIndexerEngine
   */
  public static getInstance(prisma?: PrismaClient, config?: ChainIndexerConfig): ChainIndexerEngine {
    if (!ChainIndexerEngine.instance) {
      if (!prisma) {
        throw new Error('Prisma client is required to initialize ChainIndexerEngine');
      }
      ChainIndexerEngine.instance = new ChainIndexerEngine(prisma, config);
    }
    return ChainIndexerEngine.instance;
  }

  /**
   * Reset singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    ChainIndexerEngine.instance = null as any;
  }

  /**
   * Main entry point for processing incoming blocks
   * Validates parent hash and detects re-orgs
   * @param chain - Blockchain chain identifier (STELLAR or EVM)
   * @param block - Incoming block data
   * @throws Error if processing fails
   */
  public async handleIncomingBlock(chain: string, block: IncomingBlock): Promise<BlockProcessingResult> {
    const lockKey = `${chain}:${block.number}`;

    // Validate chain type first
    const validChains = [ChainType.STELLAR, ChainType.EVM, 'STELLAR', 'EVM'];
    if (!validChains.includes(chain)) {
      return {
        success: false,
        blockNumber: block.number,
        chain,
        processedEventCount: 0,
        error: `Invalid chain type: ${chain}. Must be STELLAR or EVM`,
      };
    }

    // Prevent concurrent processing of the same block
    if (this.processingLocks.get(lockKey)) {
      throw new Error(`Block ${block.number} on chain ${chain} is already being processed`);
    }

    this.processingLocks.set(lockKey, true);

    try {
      // Retrieve the last processed block for this chain
      const lastProcessedBlock = await this.getLastProcessedBlock(chain);

      // Check if this is a new block or if parent hash matches
      if (lastProcessedBlock !== null) {
        if (block.parentHash !== lastProcessedBlock.blockHash) {
          // Re-org detected: parent hash mismatch
          try {
            await this.executeRollback(chain, block.number - 1);
          } catch (rollbackError) {
            return {
              success: false,
              blockNumber: block.number,
              chain,
              processedEventCount: 0,
              error: `Re-org detected but rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            };
          }
          return {
            success: false,
            blockNumber: block.number,
            chain,
            processedEventCount: 0,
            error: `Re-org detected at block ${block.number}. Rollback executed.`,
          };
        }
      }

      // Process the incoming block and its events
      const result = await this.processBlockWithEvents(chain, block);

      return result;
    } finally {
      // Release the lock
      this.processingLocks.delete(lockKey);
    }
  }

  /**
   * Process a block and its events with idempotent tracking
   * @param chain - Blockchain chain identifier
   * @param block - Block to process
   * @returns Processing result
   */
  private async processBlockWithEvents(chain: string, block: IncomingBlock): Promise<BlockProcessingResult> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create or update the processed block record
        const processedBlock = await tx.processedBlock.upsert({
          where: {
            blockHash: block.hash,
          },
          create: {
            chain,
            blockNumber: block.number,
            blockHash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp ? new Date(block.timestamp) : new Date(),
          },
          update: {
            processedAt: new Date(),
          },
        });

        let processedEventCount = 0;
        const failedEvents = [];

        // Process each event in the block with idempotent tracking
        for (const eventData of block.events) {
          try {
            await this.processEventIdempotent(tx, chain, block.number, block.hash, processedBlock.id, eventData);
            processedEventCount++;
          } catch (error) {
            failedEvents.push({
              eventId: eventData.id,
              error: (error as Error).message,
            });
          }
        }

        if (failedEvents.length > 0) {
          console.warn(`Failed to process ${failedEvents.length} events in block ${block.number}:`, failedEvents);
        }

        return processedEventCount;
      });

      return {
        success: true,
        blockNumber: block.number,
        chain,
        processedEventCount: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        blockNumber: block.number,
        chain,
        processedEventCount: 0,
        error: `Failed to process block: ${errorMessage}`,
      };
    }
  }

  /**
   * Process an event with idempotent tracking to ensure exactly-once semantics
   * @param tx - Prisma transaction client
   * @param chain - Blockchain chain identifier
   * @param blockNumber - Block number
   * @param blockHash - Block hash
   * @param processedBlockId - ID of the processed block
   * @param eventData - Event data to process
   */
  private async processEventIdempotent(
    tx: any,
    chain: string,
    blockNumber: number,
    blockHash: string,
    processedBlockId: string,
    eventData: BridgeEventData,
  ): Promise<void> {
    // Use upsert to ensure idempotent processing: only insert if eventId doesn't already exist
    try {
      await tx.bridgeEvent.upsert({
        where: {
          chain_eventId: {
            chain,
            eventId: eventData.id,
          },
        },
        create: {
          chain,
          blockNumber,
          blockHash,
          processedBlockId,
          eventId: eventData.id,
          eventType: eventData.type,
          sourceChain: eventData.sourceChain as string,
          targetChain: eventData.targetChain as string,
          data: eventData.data,
          transactionHash: eventData.transactionHash,
          logIndex: eventData.logIndex,
          processed: true,
          processedAt: new Date(),
        },
        update: {
          // If event already exists, just verify it was processed
          processedAt: new Date(),
          processed: true,
        },
      });
    } catch (error) {
      console.error(`Idempotent processing failed for event ${eventData.id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve the last processed block for a given chain
   * @param chain - Blockchain chain identifier
   * @returns Last processed block info or null if no blocks have been processed
   */
  private async getLastProcessedBlock(chain: string): Promise<LastProcessedBlockInfo | null> {
    const lastBlock = await this.prisma.processedBlock.findFirst({
      where: {
        chain,
        isRolledBack: false,
      },
      orderBy: {
        blockNumber: 'desc',
      },
      select: {
        blockNumber: true,
        blockHash: true,
        chain: true,
      },
    });

    return lastBlock ? { ...lastBlock } : null;
  }

  /**
   * Execute rollback to remove invalid state caused by re-org
   * Deletes all processed blocks and events at or after the fork point
   * @param chain - Blockchain chain identifier
   * @param forkBlockNumber - Block number where the fork occurred
   */
  private async executeRollback(chain: string, forkBlockNumber: number): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Find all blocks at or after the fork block number that need to be rolled back
        const blocksToRollback = await tx.processedBlock.findMany({
          where: {
            chain,
            blockNumber: {
              gte: forkBlockNumber,
            },
            isRolledBack: false,
          },
          select: {
            id: true,
            blockNumber: true,
            blockHash: true,
          },
        });

        if (blocksToRollback.length === 0) {
          // No blocks to rollback
          return;
        }

        const blockIds = blocksToRollback.map((b) => b.id);

        // Delete all bridge events associated with these blocks (cascade delete)
        await tx.bridgeEvent.deleteMany({
          where: {
            processedBlockId: {
              in: blockIds,
            },
          },
        });

        // Mark the blocks as rolled back
        await tx.processedBlock.updateMany({
          where: {
            id: {
              in: blockIds,
            },
          },
          data: {
            isRolledBack: true,
            rolledBackAt: new Date(),
          },
        });

        console.log(`Rolled back ${blockIds.length} blocks on chain ${chain} starting from block ${forkBlockNumber}`);
      });
    } catch (error) {
      console.error(`Rollback failed for chain ${chain} at block ${forkBlockNumber}:`, error);
      throw new Error(`Rollback execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current indexing status for a chain
   * @param chain - Blockchain chain identifier
   * @returns Status information
   */
  public async getIndexingStatus(chain: string): Promise<{ chain: string; lastBlockNumber: number | null; totalEventsProcessed: number }> {
    const lastBlock = await this.getLastProcessedBlock(chain);
    const eventCount = await this.prisma.bridgeEvent.count({
      where: {
        chain,
        processed: true,
      },
    });

    return {
      chain,
      lastBlockNumber: lastBlock?.blockNumber ?? null,
      totalEventsProcessed: eventCount,
    };
  }

  /**
   * Cleanup and reset indexer state (for testing)
   */
  public async cleanup(): Promise<void> {
    this.processingLocks.clear();
  }
}
