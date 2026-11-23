/**
 * Cross-Chain Bridge Event Indexer Types
 * Defines interfaces for dual-chain support (STELLAR and EVM)
 */

/**
 * Supported blockchain chains
 */
export enum ChainType {
  STELLAR = 'STELLAR',
  EVM = 'EVM',
}

/**
 * Block structure for incoming blocks from either STELLAR or EVM chains
 */
export interface IncomingBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp?: number;
  events: BridgeEventData[];
}

/**
 * Bridge event data structure
 */
export interface BridgeEventData {
  id: string; // Unique identifier for idempotent processing
  type: string;
  sourceChain: ChainType | string;
  targetChain: ChainType | string;
  data: Record<string, any>;
  transactionHash?: string;
  logIndex?: number;
}

/**
 * Last processed block information retrieved from database
 */
export interface LastProcessedBlockInfo {
  blockNumber: number;
  blockHash: string;
  chain: string;
}

/**
 * Block rollback parameters
 */
export interface RollbackParams {
  chain: string;
  forkBlockNumber: number;
  reason?: string;
}

/**
 * Configuration for the ChainIndexerEngine
 */
export interface ChainIndexerConfig {
  maxRetries?: number;
  idempotencyKeyPrefix?: string;
}

/**
 * Processing result for a block
 */
export interface BlockProcessingResult {
  success: boolean;
  blockNumber: number;
  chain: string;
  processedEventCount: number;
  error?: string;
}
