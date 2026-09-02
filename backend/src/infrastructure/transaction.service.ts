import redisClient from '../cache/RedisClient.js';
import logger from '../utils/logger.js';

export interface Transaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  status: string;
  timestamp: number;
}

export class TransactionService {
  private static readonly TX_LIST_KEY = 'visualizer:transactions';

  static async addTransaction(tx: Transaction): Promise<void> {
    const client = redisClient.getClient();
    if (!client) {
      logger.error('Redis client not available for TransactionService');
      throw new Error('Redis not connected');
    }
    
    // Store in a list in Redis (Microservices event sourcing pattern)
    await client.lpush(this.TX_LIST_KEY, JSON.stringify(tx));
    // Keep only the latest 100 transactions
    await client.ltrim(this.TX_LIST_KEY, 0, 99);
  }

  static async getRecentTransactions(): Promise<Transaction[]> {
    const client = redisClient.getClient();
    if (!client) {
      logger.warn('Redis client not available, returning empty transactions');
      return [];
    }

    const txs = await client.lrange(this.TX_LIST_KEY, 0, 99);
    return txs.map(tx => JSON.parse(tx));
  }
}
