import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployPanel } from '../DeployPanel';
import { CallPanel } from '../CallPanel';
import { StorageViewer } from '../StorageViewer';
import { WalletModal } from '@/components/wallet/WalletModal';
import { WalletProvider } from '@/contexts/WalletContext';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
  requestAccess: vi.fn().mockResolvedValue({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),
  getAddress: vi.fn().mockResolvedValue({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }),
  getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
  signTransaction: vi.fn().mockResolvedValue('AAAA...signedXDR'),
  getNetwork: vi.fn().mockResolvedValue('TESTNET'),
}));

describe('Interactive Playground Components Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  describe('DeployPanel component', () => {
    it('renders the deployment panel with stages and handles deploy override', async () => {
      const mockDeployOverride = vi.fn().mockResolvedValue({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        wasmHash: 'aabbcc112233',
        installTxHash: 'tx_install_123',
        instantiateTxHash: 'tx_instantiate_123',
        explorerUrl: 'https://stellar.expert/explorer/testnet/contract/CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        verified: true,
      });

      const onDeployed = vi.fn();

      render(
        <DeployPanel
          wasmBytes={new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])}
          contractName="hello-soroban"
          secretKey="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          deployOverride={mockDeployOverride}
          onDeployed={onDeployed}
        />
      );

      expect(screen.getByRole('heading', { level: 2, name: /Deploy Contract/i })).toBeInTheDocument();
      expect(screen.getByText(/hello-soroban/i)).toBeInTheDocument();
      expect(screen.getByText('Upload WASM')).toBeInTheDocument();
      expect(screen.getByText('Install Contract')).toBeInTheDocument();
      expect(screen.getByText('Instantiate')).toBeInTheDocument();

      const deployBtn = screen.getByRole('button', { name: /Deploy Contract/i });
      expect(deployBtn).not.toBeDisabled();

      fireEvent.click(deployBtn);

      await waitFor(() => {
        expect(mockDeployOverride).toHaveBeenCalledTimes(1);
        expect(onDeployed).toHaveBeenCalledTimes(1);
      });

      expect(screen.getByText('Verified on Stellar Expert')).toBeInTheDocument();
      expect(screen.getByText('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')).toBeInTheDocument();
    });

    it('disables deploy button when required fields are missing', () => {
      render(
        <DeployPanel
          wasmBytes={null}
          contractName="test-contract"
        />
      );

      const deployBtn = screen.getByRole('button', { name: /Deploy Contract/i });
      expect(deployBtn).toBeDisabled();
    });
  });

  describe('CallPanel component', () => {
    it('renders function selector and invokes functions successfully', async () => {
      const onInvoke = vi.fn().mockResolvedValue({ message: 'Hello World' });

      render(
        <CallPanel
          contractId="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
          functions={[
            { name: 'greet', args: [{ name: 'name', type: 'Symbol' }] },
          ]}
          onInvoke={onInvoke}
        />
      );

      expect(screen.getByText('Invoke Contract Function')).toBeInTheDocument();
      expect(screen.getByText('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')).toBeInTheDocument();
      expect(screen.getByDisplayValue('greet')).toBeInTheDocument();

      const input = screen.getByPlaceholderText('Value for name');
      fireEvent.change(input, { target: { value: 'Stellar' } });

      const invokeBtn = screen.getByRole('button', { name: /Invoke/i });
      fireEvent.click(invokeBtn);

      await waitFor(() => {
        expect(onInvoke).toHaveBeenCalledWith('greet', { name: 'Stellar' });
      });

      expect(await screen.findByText(/Hello World/i)).toBeInTheDocument();
    });
  });

  describe('StorageViewer component', () => {
    it('renders storage tabs and table properly', () => {
      render(<StorageViewer />);

      expect(screen.getByText(/Soroban State Diff Inspector/i)).toBeInTheDocument();
      expect(screen.getByText(/FE-HARD-20/i)).toBeInTheDocument();
    });
  });

  describe('WalletModal component', () => {
    it('does not render when closed', () => {
      render(
        <WalletProvider>
          <WalletModal isOpen={false} onClose={vi.fn()} />
        </WalletProvider>
      );

      expect(screen.queryByText('Connect Stellar Wallet')).not.toBeInTheDocument();
    });

    it('renders wallet options and allows closing when open', () => {
      const onClose = vi.fn();
      render(
        <WalletProvider>
          <WalletModal isOpen={true} onClose={onClose} />
        </WalletProvider>
      );

      expect(screen.getByText('Connect Stellar Wallet')).toBeInTheDocument();
      expect(screen.getByText('Freighter')).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /Close modal/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
