import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import cacheService from './CacheService.js';
import redisClient from './RedisClient.js';

export interface BlockHeader {
  height: number;
  hash: string;
  timestamp: number;
  ledgerCloseTime: number;
}

/**
 * Listens for new block headers and invalidates relevant caches
 * This is critical for keeping on-chain state fresh without hitting RPC rate limits
 */
export class BlockHeaderListener extends EventEmitter {
  private isListening = false;
  private lastBlockHeight = 0;
  private pollingInterval: NodeJS.Timer | null = null;
  private readonly POLL_INTERVAL = parseInt(process.env.BLOCK_POLL_INTERVAL || '10000', 10); // 10 seconds default

  /**
   * Start listening for new blocks
   */
  async start(): Promise<void> {
    if (this.isListening) {
      logger.warn('BlockHeaderListener already running');
      return;
    }

    try {
      this.isListening = true;
      logger.info('BlockHeaderListener started');

      // Poll for new blocks
      this.pollingInterval = setInterval(() => this.checkForNewBlocks(), this.POLL_INTERVAL);

      // Also check immediately on start
      await this.checkForNewBlocks();

      this.emit('started');
    } catch (error) {
      logger.error('Failed to start BlockHeaderListener:', error);
      this.isListening = false;
    }
  }

  /**
   * Stop listening for new blocks
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isListening = false;
    logger.info('BlockHeaderListener stopped');
    this.emit('stopped');
  }

  /**
   * Check for new blocks and invalidate cache if needed
   */
  private async checkForNewBlocks(): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) {
        logger.debug('Redis client not available for block header check');
        return;
      }

      // Try to get latest block from cache first
      const cachedBlockHeight = await cacheService.get<number>('blockchain:latest-block:height');

      if (cachedBlockHeight && cachedBlockHeight > this.lastBlockHeight) {
        this.lastBlockHeight = cachedBlockHeight;
        await this.onNewBlock(cachedBlockHeight);
      }
    } catch (error) {
      logger.debug('Error checking for new blocks:', error);
    }
  }

  /**
   * Handle new block event - invalidate relevant caches
   */
  private async onNewBlock(blockHeight: number): Promise<void> {
    try {
      logger.debug(`New block detected: ${blockHeight}`);

      // Invalidate blockchain-related caches
      await cacheService.delPattern('blockchain:*');
      await cacheService.delPattern('account:*');
      await cacheService.delPattern('contract:state:*');
      await cacheService.delPattern('transaction:*');

      // Emit event for subscribers
      this.emit('newBlock', { height: blockHeight });

      logger.info(`Cache invalidated for block ${blockHeight}`);
    } catch (error) {
      logger.error('Error handling new block:', error);
    }
  }

  /**
   * Register a callback for new block events
   */
  onNewBlockDetected(callback: (blockHeight: number) => Promise<void>): void {
    this.on('newBlock', (event: { height: number }) => {
      callback(event.height).catch((err) => {
        logger.error('Error in newBlock callback:', err);
      });
    });
  }

  /**
   * Get current listening status
   */
  getStatus(): {
    isListening: boolean;
    lastBlockHeight: number;
    pollInterval: number;
  } {
    return {
      isListening: this.isListening,
      lastBlockHeight: this.lastBlockHeight,
      pollInterval: this.POLL_INTERVAL,
    };
  }
}

export default new BlockHeaderListener();
