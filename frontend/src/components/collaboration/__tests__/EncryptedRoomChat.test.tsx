import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EncryptedRoomChat } from '../EncryptedRoomChat';
import { getItem, setItem } from '@/lib/localStorage';
import { verifyP2PIdentity, getOrCreateP2PIdentity } from '@/lib/p2p-crypto';
import * as Y from 'yjs';

jest.mock('@/lib/localStorage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/lib/p2p-crypto', () => ({
  getOrCreateP2PIdentity: jest.fn(),
  verifyP2PIdentity: jest.fn(),
  encryptP2PMessage: jest.fn(),
  decryptP2PMessage: jest.fn(),
  fingerprintP2PIdentity: jest.fn(),
}));

jest.mock('y-websocket', () => ({
  WebsocketProvider: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    destroy: jest.fn(),
  })),
}));

// Mock Yjs to allow injecting peers
let mockIdentitiesMap: any;
let mockMessagesArray: any;
let observeIdentitiesCb: (() => void) | null = null;
let observeMessagesCb: (() => void) | null = null;

jest.mock('yjs', () => {
  mockIdentitiesMap = {
    values: jest.fn().mockReturnValue([]),
    set: jest.fn(),
    observe: jest.fn((cb) => { observeIdentitiesCb = cb; }),
    unobserve: jest.fn(),
  };
  mockMessagesArray = {
    toArray: jest.fn().mockReturnValue([]),
    push: jest.fn(),
    observe: jest.fn((cb) => { observeMessagesCb = cb; }),
    unobserve: jest.fn(),
  };
  return {
    Doc: jest.fn().mockImplementation(() => ({
      getMap: jest.fn().mockReturnValue(mockIdentitiesMap),
      getArray: jest.fn().mockReturnValue(mockMessagesArray),
      destroy: jest.fn(),
    })),
  };
});

describe('EncryptedRoomChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getItem as jest.Mock).mockReturnValue([]);
    (getOrCreateP2PIdentity as jest.Mock).mockResolvedValue({
      keyId: 'local-key-id',
      curve: 'P-256',
      publicKeyJwk: {},
      createdAt: 12345,
    });
    (verifyP2PIdentity as jest.Mock).mockResolvedValue(true);
    mockIdentitiesMap.values.mockReturnValue([]);
    mockMessagesArray.toArray.mockReturnValue([]);
    observeIdentitiesCb = null;
    observeMessagesCb = null;
  });

  it('renders correctly and shows local key', async () => {
    render(<EncryptedRoomChat roomId="test-room" />);
    
    expect(screen.getByText('Encrypted Chat')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/local-key-...-key-id/)).toBeInTheDocument();
    });
  });

  it('shows peer fingerprint and allows verification', async () => {
    render(<EncryptedRoomChat roomId="test-room" />);
    
    await waitFor(() => {
      expect(getOrCreateP2PIdentity).toHaveBeenCalled();
    });

    const peerId = 'peer-fake-key-id';
    mockIdentitiesMap.values.mockReturnValue([
      { keyId: 'local-key-id' },
      { keyId: peerId }
    ]);
    
    // Trigger observer
    if (observeIdentitiesCb) observeIdentitiesCb();

    await waitFor(() => {
      expect(screen.getByText(/peer-fake-...-key-id/)).toBeInTheDocument();
    });

    const verifyButton = screen.getByRole('button', { name: /verify identity/i });
    expect(verifyButton).toBeInTheDocument();

    fireEvent.click(verifyButton);

    expect(setItem).toHaveBeenCalledWith('p2p-verified-peers', [peerId]);
    expect(screen.getByRole('button', { name: /verified/i })).toBeInTheDocument();
  });

  it('shows mismatch warning for invalid peers', async () => {
    (verifyP2PIdentity as jest.Mock).mockImplementation((identity) => Promise.resolve(identity.keyId !== 'spoofed-key-id'));
    
    render(<EncryptedRoomChat roomId="test-room" />);
    
    await waitFor(() => {
      expect(getOrCreateP2PIdentity).toHaveBeenCalled();
    });

    mockIdentitiesMap.values.mockReturnValue([
      { keyId: 'local-key-id' },
      { keyId: 'spoofed-key-id' }
    ]);
    
    if (observeIdentitiesCb) observeIdentitiesCb();

    await waitFor(() => {
      expect(screen.getByText(/One or more peers in this room have an invalid identity fingerprint/)).toBeInTheDocument();
    });
  });
});
