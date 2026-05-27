'use client';

import { useWallet, WALLET_PROVIDERS } from '@/contexts/WalletContext';
import { CheckCircle2, Copy, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

interface WalletConnectCardProps {
  title: string;
  description: string;
  connectedTitle?: string;
  connectedDescription?: string;
  className?: string;
}

export function WalletConnectCard({
  title,
  description,
  connectedTitle = 'Wallet connected',
  connectedDescription = 'Your wallet is ready. You can continue to the next step.',
  className = '',
}: WalletConnectCardProps) {
  const { publicKey, activeWallet, isConnecting, error, connect, disconnect } = useWallet();
  const [localError, setLocalError] = useState<string | null>(null);
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);

    refresh();
    const timeoutId = window.setTimeout(refresh, 1200);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const handleConnect = async (walletName: string) => {
    setLocalError(null);
    try {
      await connect(walletName);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  };

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-zinc-950 p-8 shadow-[0_0_50px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div className="mb-8">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]">
          <Wallet className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-wide text-white uppercase">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-gray-400">{description}</p>
      </div>

      {publicKey ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                  {connectedTitle}
                </p>
                <p className="mt-1 text-sm text-emerald-100">{connectedDescription}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                {activeWallet || 'Connected wallet'}
              </p>
              <p className="mt-2 font-mono text-sm break-all text-white">{publicKey}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(publicKey)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/5"
            >
              <Copy className="h-4 w-4" />
              Copy address
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="rounded-xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Disconnect wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {WALLET_PROVIDERS.map((wallet) => {
            const isInstalled = wallet.isInstalled();
            const statusText =
              wallet.name === 'Freighter'
                ? isInstalled
                  ? 'Ready to connect'
                  : 'Click to detect extension'
                : isInstalled
                  ? 'Ready to connect'
                  : 'Install required';
            const statusClass =
              wallet.name === 'Freighter' || isInstalled ? 'text-emerald-400' : 'text-gray-500';

            return (
              <button
                key={wallet.name}
                type="button"
                onClick={() => handleConnect(wallet.name)}
                disabled={isConnecting}
                className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-black px-5 py-4 text-left transition hover:border-red-500/50 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-2xl">{wallet.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-white">
                    {wallet.name}
                  </p>
                  <p className={`mt-1 text-xs ${statusClass}`}>{statusText}</p>
                </div>
              </button>
            );
          })}

          {(error || localError) && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {error || localError}
            </div>
          )}

          <p className="text-xs leading-6 text-gray-500">
            Connect a Stellar wallet first. After that we can ask for your learner details.
          </p>
        </div>
      )}
    </div>
  );
}
