'use client';

import {
  getAddress as getFreighterAddress,
  isConnected as isFreighterConnected,
  requestAccess as requestFreighterAccess,
  signTransaction as signFreighterTransaction,
} from '@stellar/freighter-api';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
      isConnected: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
      signTransaction: (xdr: string, opts?: object) => Promise<string>;
    };
    freighterApi?: {
      isConnected?: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
      signTransaction: (xdr: string, opts?: object) => Promise<string>;
    };
    stellar?: {
      freighter?: {
        isConnected?: () => Promise<boolean>;
        getPublicKey: () => Promise<string>;
        signTransaction: (xdr: string, opts?: object) => Promise<string>;
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

const freighterAdapter: WalletProvider = {
  name: 'Freighter',
  icon: '🚀',
  isInstalled: () =>
    typeof window !== 'undefined' &&
    (!!window.freighter || !!window.freighterApi || !!window.stellar?.freighter),
  connect: async () => {
    const connection = await isFreighterConnected();
    if (connection.error) {
      throw new Error(connection.error);
    }

    if (!connection.isConnected) {
      throw new Error(
        'Freighter is not available to this page yet. Refresh the page and make sure the extension is enabled for this site.'
      );
    }

    const access = await requestFreighterAccess();
    if (access.error || !access.address) {
      throw new Error(access.error || 'Freighter did not return an address');
    }

    return access.address;
  },
  disconnect: async () => {},
  getPublicKey: async () => {
    const address = await getFreighterAddress();
    if (address.error || !address.address) {
      return null;
    }

    return address.address;
  },
  signTransaction: async (xdr: string) => {
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

export const WALLET_PROVIDERS: WalletProvider[] = [freighterAdapter, albedoAdapter, rabetAdapter];

// ─── Context ──────────────────────────────────────────────────────────────────

interface WalletContextType {
  publicKey: string | null;
  activeWallet: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  connected: boolean;
  error: string | null;
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

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('stellar_wallet');
    if (saved) {
      const { wallet, pk } = JSON.parse(saved);
      setActiveWallet(wallet);
      setPublicKey(pk);
    }
  }, []);

  const connect = useCallback(async (providerName: string) => {
    const provider = WALLET_PROVIDERS.find((p) => p.name === providerName);
    if (!provider) throw new Error(`Unknown wallet: ${providerName}`);
    setIsConnecting(true);
    setError(null);
    try {
      const pk = await provider.connect();
      setPublicKey(pk);
      setActiveWallet(providerName);
      localStorage.setItem('stellar_wallet', JSON.stringify({ wallet: providerName, pk }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      setError(msg);
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = WALLET_PROVIDERS.find((p) => p.name === activeWallet);
    await provider?.disconnect();
    setPublicKey(null);
    setActiveWallet(null);
    localStorage.removeItem('stellar_wallet');
  }, [activeWallet]);

  const signTransaction = useCallback(
    async (xdr: string) => {
      const provider = WALLET_PROVIDERS.find((p) => p.name === activeWallet);
      if (!provider) throw new Error('No wallet connected');
      return provider.signTransaction(xdr);
    },
    [activeWallet]
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
