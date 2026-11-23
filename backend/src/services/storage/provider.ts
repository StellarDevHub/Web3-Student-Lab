import type { StorageProvider } from './types.js';
import { createMockStorageProvider } from './providers/index.js';
import { createPinataStorageProvider } from './providers/index.js';

export const createStorageProvider = (): StorageProvider => {
  const provider = (process.env.DECENTRALIZED_STORAGE_PROVIDER || 'pinata').toLowerCase();

  if (provider === 'mock' || process.env.NODE_ENV === 'test' || !process.env.PINATA_JWT) {
    return createMockStorageProvider();
  }

  return createPinataStorageProvider();
};

