'use client';

import { useWallet } from '@/contexts/WalletContext';
import { AlertCircle, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function WalletGate({ children }: { children: React.ReactNode }) {
  const { isConnected, connect, isConnecting, availableWallets, activeWallet } = useWallet();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Public routes (landing, offline recovery, auth) must always render — on the
  // server AND the client — so they never depend on mount state or localStorage.
  // Gated routes stay blocked until mounted to avoid a hydration flicker / a
  // leaked localStorage wallet bypassing the gate before React hydrates.
  const isPublicRoute =
    pathname === '/' || pathname === '/offline' || pathname?.startsWith('/auth/');

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!isMounted) {
    return null;
  }

  const hasLocalWallet = typeof window !== 'undefined' && !!localStorage.getItem('stellar_wallet');

  if (isConnected || hasLocalWallet) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-bg-secondary border border-border-theme rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-red-500/10 p-4 rounded-full border border-red-500/20">
            <Wallet className="h-12 w-12 text-red-500" />
          </div>
        </div>
        
        <h1 className="text-2xl font-black text-center uppercase tracking-tight mb-2">
          Authentication Required
        </h1>
        <p className="text-text-secondary text-center mb-8">
          You must connect your Web3 wallet to access the Web3 Student Lab platform.
        </p>

        <div className="space-y-4">
          {availableWallets.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => connect(wallet.name)}
              disabled={isConnecting}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border-theme hover:border-red-500 hover:bg-red-500/5 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{wallet.icon}</span>
                <span className="font-bold">{wallet.name}</span>
              </div>
              {isConnecting && activeWallet === wallet.name ? (
                <span className="text-sm text-text-secondary animate-pulse">Connecting...</span>
              ) : (
                <span className="text-sm text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                  Connect →
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200/80">
            If you don't have a wallet installed, we recommend installing the Freighter extension for the Stellar network.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
