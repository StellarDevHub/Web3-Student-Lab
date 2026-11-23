import { TransactionService } from '../src/infrastructure/transaction.service';
import { P2PService } from '../src/infrastructure/p2p.service';
import redisClient from '../src/cache/RedisClient';
import prisma from '../src/db/index';

// Mock Redis Client
jest.mock('../src/cache/RedisClient', () => ({
  getClient: jest.fn().mockReturnValue({
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    lrange: jest.fn().mockResolvedValue(['{"id":"1","sender":"A","receiver":"B","amount":10,"status":"success","timestamp":1000}']),
  }),
}));

// Mock Prisma client used by P2PService
jest.mock('../src/db/index', () => ({
  p2PNode: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  p2PMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
}));

describe('Platform Infrastructure Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transaction Visualizer', () => {
    it('should add a transaction via TransactionService', async () => {
      const tx = {
        id: '1',
        sender: 'A',
        receiver: 'B',
        amount: 10,
        status: 'success',
        timestamp: 1000,
      };

      await TransactionService.addTransaction(tx);
      const client = redisClient.getClient();
      expect(client?.lpush).toHaveBeenCalledWith(
        'visualizer:transactions',
        JSON.stringify(tx)
      );
      expect(client?.ltrim).toHaveBeenCalledWith('visualizer:transactions', 0, 99);
    });

    it('should get recent transactions via TransactionService', async () => {
      const txs = await TransactionService.getRecentTransactions();
      expect(txs.length).toBe(1);
      expect(txs[0].sender).toBe('A');
    });
  });

  describe('P2P Network Simulator', () => {
    it('should add a new P2P node', async () => {
      (prisma.p2PNode.create as jest.Mock).mockResolvedValue({
        id: 'node_123',
        nodeName: 'Test Node',
      });

      const node = await P2PService.addNode('default', 'Test Node', '127.0.0.1', 8080);
      expect(prisma.p2PNode.create).toHaveBeenCalled();
      expect(node.nodeName).toBe('Test Node');
    });

    it('should broadcast a P2P message', async () => {
      (prisma.p2PMessage.create as jest.Mock).mockResolvedValue({
        id: 'msg_1',
        payload: { action: 'ping' },
      });

      const message = await P2PService.broadcastMessage('sender_1', 'receiver_1', { action: 'ping' });
      expect(prisma.p2PMessage.create).toHaveBeenCalled();
      expect(message.payload).toEqual({ action: 'ping' });
    });
  });
});
