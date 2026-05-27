import { getAccountExplorerLink, getExplorerLink } from '../src/utils/explorer.js';

// Mock process.env
const originalEnv = process.env;

describe('Explorer Utility', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('getExplorerLink', () => {
    const txHash = 'abc1234567890def';

    it('should generate a testnet link by default (when STELLAR_NETWORK is not set)', () => {
      delete process.env.STELLAR_NETWORK;
      const link = getExplorerLink(txHash);
      expect(link).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
    });

    it('should generate a testnet link when STELLAR_NETWORK is testnet', () => {
      process.env.STELLAR_NETWORK = 'testnet';
      const link = getExplorerLink(txHash);
      expect(link).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
    });

    it('should generate a public link when STELLAR_NETWORK is mainnet', () => {
      process.env.STELLAR_NETWORK = 'mainnet';
      const link = getExplorerLink(txHash);
      expect(link).toBe(`https://stellar.expert/explorer/public/tx/${txHash}`);
    });

    it('should generate a public link when STELLAR_NETWORK is public', () => {
      process.env.STELLAR_NETWORK = 'public';
      const link = getExplorerLink(txHash);
      expect(link).toBe(`https://stellar.expert/explorer/public/tx/${txHash}`);
    });

    it('should allow overriding the network to mainnet', () => {
      process.env.STELLAR_NETWORK = 'testnet';
      const link = getExplorerLink(txHash, 'mainnet');
      expect(link).toBe(`https://stellar.expert/explorer/public/tx/${txHash}`);
    });

    it('should allow overriding the network to testnet', () => {
      process.env.STELLAR_NETWORK = 'mainnet';
      const link = getExplorerLink(txHash, 'testnet');
      expect(link).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
    });
  });

  describe('getAccountExplorerLink', () => {
    const publicKey = 'GA1234567890ABCDEF';

    it('should generate a testnet account link by default', () => {
      process.env.STELLAR_NETWORK = 'testnet';
      const link = getAccountExplorerLink(publicKey);
      expect(link).toBe(`https://stellar.expert/explorer/testnet/account/${publicKey}`);
    });

    it('should generate a public account link for mainnet', () => {
      process.env.STELLAR_NETWORK = 'mainnet';
      const link = getAccountExplorerLink(publicKey);
      expect(link).toBe(`https://stellar.expert/explorer/public/account/${publicKey}`);
    });
  });
});
