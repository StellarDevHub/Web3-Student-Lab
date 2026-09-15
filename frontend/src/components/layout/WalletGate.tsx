'use client';

import { useWallet, StellarNetwork } from '@/contexts/WalletContext';
import { AlertCircle, CheckCircle2, Download, ExternalLink, Globe, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function WalletGate({ children }: { children: React.ReactNode }) {
  const {
    isConnected,
    connect,
    isConnecting,
    availableWallets,
    activeWallet,
    activeNetwork,
    walletNetwork,
    isNetworkDivergent,
    blockHeight,
    switchNetwork,
    setAppNetwork,
  } = useWallet();

  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    return (
      <div className="relative min-h-screen flex flex-col">
        {isNetworkDivergent && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 p-3 px-4 text-amber-200 flex flex-wrap items-center justify-between gap-3 text-sm z-50">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0" />
              <span>
                <strong>Network Mismatch Detected:</strong> Application target is{' '}
                <span className="font-semibold underline">{activeNetwork}</span> but connected wallet is on{' '}
                <span className="font-semibold underline">{walletNetwork}</span>.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => switchNetwork(activeNetwork)}
                className="px-3 py-1 bg-amber-500 text-black font-semibold rounded-md text-xs hover:bg-amber-400 transition-colors"
              >
                Switch Wallet to {activeNetwork}
              </button>
              <button
                onClick={() => setAppNetwork((walletNetwork as StellarNetwork) || 'TESTNET')}
                className="px-3 py-1 bg-neutral-800 text-white font-medium rounded-md text-xs border border-amber-500/30 hover:bg-neutral-700 transition-colors"
              >
                Align App to {walletNetwork}
              </button>
            </div>
          </div>
        )}
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full bg-bg-secondary border border-border-theme rounded-2xl p-8 shadow-2xl space-y-6"
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/10 p-3 rounded-full border border-red-500/20">
              <Wallet className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">
                <span className="sr-only">Authentication Required: </span>
                Connect Web3 Wallet
              </h1>
              <p className="text-xs text-text-secondary">
                Select your preferred Stellar ecosystem wallet to log in.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end text-xs">
            <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-full px-3 py-1">
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-semibold">{activeNetwork}</span>
            </div>
            {blockHeight && (
              <span className="text-[10px] text-text-secondary mt-1">
                Block #{blockHeight.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Available & Detected Wallets
          </h2>
          {availableWallets.map((wallet) => {
            const installed = wallet.isInstalled();
            return (
              <div
                key={wallet.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  installed
                    ? 'border-border-theme hover:border-red-500 hover:bg-red-500/5 cursor-pointer'
                    : 'border-neutral-800 bg-neutral-950/40 opacity-75'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{wallet.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{wallet.name}</span>
                      {wallet.name === 'Freighter' && (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                          Recommended
                        </span>
                      )}
                      {installed ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Detected
                        </span>
                      ) : (
                        <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
                          Not Installed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{wallet.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!installed && (
                    <a
                      href={wallet.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium rounded-lg text-neutral-300 transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Install
                      <ExternalLink className="h-3 w-3 text-neutral-500" />
                    </a>
                  )}
                  <button
                    onClick={() => connect(wallet.name)}
                    disabled={isConnecting}
                    aria-label={`Connect ${wallet.name}`}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isConnecting && activeWallet === wallet.name ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect →'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3 text-xs text-yellow-200/80">
          <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <span>
            Targeting <strong>{activeNetwork}</strong>. If your wallet is on a different network, you will be prompted to switch seamlessly.
          </span>
        </div>
      </motion.div>
    </div>
  );
}
