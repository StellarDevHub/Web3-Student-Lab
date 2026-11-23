import { vi } from 'vitest';

export const mockFreighter = {
  isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
  requestAccess: vi.fn().mockResolvedValue({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),
  getAddress: vi.fn().mockResolvedValue({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),
  getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
  signTransaction: vi.fn().mockResolvedValue('AAAA...signedXDR'),
  getNetwork: vi.fn().mockResolvedValue('TESTNET'),
};
