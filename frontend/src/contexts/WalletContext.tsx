'use client';

import {
  getAddress as getFreighterAddress,
  isConnected as isFreighterConnected,
  requestAccess as requestFreighterAccess,
  signTransaction as signFreighterTransaction,
} from '@stellar/freighter-api';
import { useMachine } from '@xstate/react';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  web3TransactionMachine,
  type Web3TransactionContext,
  type Web3TransactionStatus,
} from '@/lib/web3/transactionMachine';

// ─── Wallet Interface ─────────────────────────────────────────────────────────

export interface WalletProvider {
  name: string;
  icon: string;
  isInstalled: () => boolean;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  getPublicKey: () => Promise<string | null>;
  signTransaction: (xdr: string) => Promise<string>;
  onAccountChange?: (cb: (pk: string | null) => void) => () => void;
}

// ─── Freighter Adapter ────────────────────────────────────────────────────────

declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean | { isConnected: boolean; error?: string }>;
      requestAccess?: () => Promise<{ address: string; error?: string }>;
      getAddress?: () => Promise<{ address: string; error?: string }>;
      getPublicKey?: () => Promise<string>;
      signTransaction: (
        xdr: string,
        opts?: object
      ) => Promise<string | { signedTxXdr: string; signerAddress: string; error?: string }>;
    };
    freighterApi?: {
      isConnected?: () => Promise<boolean | { isConnected: boolean; error?: string }>;
      requestAccess?: () => Promise<{ address: string; error?: string }>;
      getAddress?: () => Promise<{ address: string; error?: string }>;
      getPublicKey?: () => Promise<string>;
      signTransaction: (
        xdr: string,
        opts?: object
      ) => Promise<string | { signedTxXdr: string; signerAddress: string; error?: string }>;
    };
    stellar?: {
      freighter?: {
        isConnected?: () => Promise<boolean | { isConnected: boolean; error?: string }>;
        requestAccess?: () => Promise<{ address: string; error?: string }>;
        getAddress?: () => Promise<{ address: string; error?: string }>;
        getPublicKey?: () => Promise<string>;
        signTransaction: (
          xdr: string,
          opts?: object
        ) => Promise<string | { signedTxXdr: string; signerAddress: string; error?: string }>;
      };
    };
    albedo?: {
      publicKey: (opts?: object) => Promise<{ pubkey: string }>;
      tx: (opts: { xdr: string; network: string }) => Promise<{ signed_envelope_xdr: string }>;
    };
    rabet?: {
      connect: () => Promise<{ publicKey: string }>;
      sign: (xdr: string, network: string) => Promise<{ xdr: string }>;
    };
  }
}

const resolveInjectedFreighter = () =>
  typeof window === 'undefined'
    ? null
    : window.freighterApi || window.freighter || window.stellar?.freighter || null;

const normalizeConnection = (connection: boolean | { isConnected: boolean; error?: string }) => {
  if (typeof connection === 'boolean') {
    return { isConnected: connection };
  }
  return connection;
};

const getInjectedFreighterAddress = async () => {
  const injected = resolveInjectedFreighter();
  if (!injected) {
    return null;
  }
  if (injected.requestAccess) {
    const access = await injected.requestAccess();
    if (access.error || !access.address) {
      throw new Error(access.error || 'Freighter did not return an address');
    }
    return access.address;
  }
  if (injected.getAddress) {
    const address = await injected.getAddress();
    if (address.error || !address.address) {
      throw new Error(address.error || 'Freighter did not return an address');
    }
    return address.address;
  }
  return injected.getPublicKey?.() ?? null;
};

const signWithInjectedFreighter = async (xdr: string) => {
  const injected = resolveInjectedFreighter();
  if (!injected?.signTransaction) {
    return null;
  }
  const result = await injected.signTransaction(xdr);
  if (typeof result === 'string') {
    return result;
  }
  if (result.error || !result.signedTxXdr) {
    throw new Error(result.error || 'Freighter could not sign the transaction');
  }
  return result.signedTxXdr;
};

const freighterAdapter: WalletProvider = {
  name: 'Freighter',
  icon: '🚀',
  isInstalled: () =>
    typeof window !== 'undefined' &&
    (!!window.freighter || !!window.freighterApi || !!window.stellar?.freighter),
  connect: async () => {
    let access;
    try {
      access = await requestFreighterAccess();
    } catch (e) {
      throw new Error('Failed to request access from Freighter. Make sure the extension is unlocked and enabled for this site.');
    }
    
    if (!access || access.error || !access.address) {
      throw new Error(access?.error || 'Freighter did not return an address. Please unlock your wallet and try again.');
    }

    return access.address;
  },
  disconnect: async () => {},
  getPublicKey: async () => {
    const injected = resolveInjectedFreighter();
    if (injected?.getAddress) {
      const injectedAddress = await injected.getAddress();
      return injectedAddress.error || !injectedAddress.address ? null : injectedAddress.address;
    }
    if (injected?.getPublicKey) {
      return injected.getPublicKey();
    }

    const address = await getFreighterAddress();
    if (address.error || !address.address) {
      return null;
    }

    return address.address;
  },
  signTransaction: async (xdr: string) => {
    const injectedResult = await signWithInjectedFreighter(xdr);
    if (injectedResult) {
      return injectedResult;
    }

    const result = await signFreighterTransaction(xdr);
    if (result.error || !result.signedTxXdr) {
      throw new Error(result.error || 'Freighter could not sign the transaction');
    }

    return result.signedTxXdr;
  },
};

const albedoAdapter: WalletProvider = {
  name: 'Albedo',
  icon: '🌐',
  isInstalled: () => true, // Albedo is web-based, always available
  connect: async () => {
    if (!window.albedo) throw new Error('Albedo not available');
    const res = await window.albedo.publicKey({});
    return res.pubkey;
  },
  disconnect: async () => {},
  getPublicKey: async () => {
    if (!window.albedo) return null;
    try {
      const res = await window.albedo.publicKey({});
      return res.pubkey;
    } catch {
      return null;
    }
  },
  signTransaction: async (xdr: string) => {
    if (!window.albedo) throw new Error('Albedo not available');
    const res = await window.albedo.tx({ xdr, network: 'testnet' });
    return res.signed_envelope_xdr;
  },
};

const rabetAdapter: WalletProvider = {
  name: 'Rabet',
  icon: '🔷',
  isInstalled: () => typeof window !== 'undefined' && !!window.rabet,
  connect: async () => {
    if (!window.rabet) throw new Error('Rabet not installed');
    const res = await window.rabet.connect();
    return res.publicKey;
  },
  disconnect: async () => {},
  getPublicKey: async () => {
    if (!window.rabet) return null;
    try {
      const res = await window.rabet.connect();
      return res.publicKey;
    } catch {
      return null;
    }
  },
  signTransaction: async (xdr: string) => {
    if (!window.rabet) throw new Error('Rabet not installed');
    const res = await window.rabet.sign(xdr, 'TESTNET');
    return res.xdr;
  },
};

const mockAdapter: WalletProvider = { name: "Dev Mock Wallet", icon: "🛠️", isInstalled: () => true, connect: async () => "GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT", disconnect: async () => {}, getPublicKey: async () => "GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT", signTransaction: async (xdr) => xdr };

export const WALLET_PROVIDERS: WalletProvider[] = [freighterAdapter, albedoAdapter, rabetAdapter, mockAdapter];

// ─── Context ──────────────────────────────────────────────────────────────────

interface WalletContextType {
  publicKey: string | null;
  activeWallet: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  connected: boolean;
  error: string | null;
  transactionState: Web3TransactionStatus;
  transactionContext: Web3TransactionContext;
  connect: (providerName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
  availableWallets: WalletProvider[];
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionSnapshot, sendTransaction] = useMachine(web3TransactionMachine);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('stellar_wallet');
    if (saved) {
      const { wallet, pk } = JSON.parse(saved);
      setActiveWallet(wallet);
      setPublicKey(pk);
      sendTransaction({ type: 'WALLET_CONNECTED', walletName: wallet, publicKey: pk });
    }
  }, [sendTransaction]);

  const connect = useCallback(async (providerName: string) => {
    const provider = WALLET_PROVIDERS.find((p) => p.name === providerName);
    if (!provider) throw new Error(`Unknown wallet: ${providerName}`);
    setIsConnecting(true);
    setError(null);
    sendTransaction({ type: 'CONNECT_WALLET', walletName: providerName });
    try {
      const pk = await provider.connect();
      setPublicKey(pk);
      setActiveWallet(providerName);
      localStorage.setItem('stellar_wallet', JSON.stringify({ wallet: providerName, pk }));
      sendTransaction({ type: 'WALLET_CONNECTED', walletName: providerName, publicKey: pk });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      setError(msg);
      sendTransaction({ type: 'FAIL', error: msg });
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, [sendTransaction]);

  const disconnect = useCallback(async () => {
    const provider = WALLET_PROVIDERS.find((p) => p.name === activeWallet);
    await provider?.disconnect();
    setPublicKey(null);
    setActiveWallet(null);
    localStorage.removeItem('stellar_wallet');
    sendTransaction({ type: 'DISCONNECT_WALLET' });
  }, [activeWallet, sendTransaction]);

  const signTransaction = useCallback(
    async (xdr: string) => {
      const provider = WALLET_PROVIDERS.find((p) => p.name === activeWallet);
      if (!provider) throw new Error('No wallet connected');
      sendTransaction({ type: 'REQUEST_SIGNATURE', transactionXdr: xdr });
      try {
        const signedXdr = await provider.signTransaction(xdr);
        sendTransaction({ type: 'SIGNATURE_APPROVED', signedTransactionXdr: signedXdr });
        return signedXdr;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transaction signing failed';
        sendTransaction({ type: 'FAIL', error: msg });
        throw e;
      }
    },
    [activeWallet, sendTransaction]
  );

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        activeWallet,
        isConnecting,
        isConnected: !!publicKey,
        connected: !!publicKey,
        error,
        transactionState: transactionSnapshot.value as Web3TransactionStatus,
        transactionContext: transactionSnapshot.context,
        connect,
        disconnect,
        signTransaction,
        availableWallets: WALLET_PROVIDERS,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
