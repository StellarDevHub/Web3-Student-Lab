'use client';

import { useWallet } from '@/contexts/WalletContext';
import { getPublicEnv } from '@/lib/env';
import { Server } from '@stellar/stellar-sdk';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface WalletBalance {
  key: string;
  code: string;
  issuer: string | null;
  amount: string;
}

interface BalanceDelta {
  id: number;
  code: string;
  amount: number;
}

function formatAmount(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 7,
  }).format(value);
}

function getHorizonUrl(network: string): string {
  if (network === 'PUBLIC') return 'https://horizon.stellar.org';
  if (network === 'FUTURENET') return 'https://horizon-futurenet.stellar.org';
  return getPublicEnv().horizonUrl;
}

export function BalanceViewer() {
  const { publicKey, activeNetwork } = useWallet();
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [deltas, setDeltas] = useState<BalanceDelta[]>([]);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousBalances = useRef<Record<string, number>>({});
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshBalances = useCallback(
    async (server: Server, accountId: string, announceChanges: boolean) => {
      try {
        const account = await server.loadAccount(accountId);
        const nextBalances = account.balances.map((balance) => {
          const isNative = balance.asset_type === 'native';
          const code = isNative ? 'XLM' : balance.asset_code;
          const issuer = isNative ? null : balance.asset_issuer;
          return {
            key: isNative ? 'native' : `${code}:${issuer}`,
            code,
            issuer,
            amount: balance.balance,
          };
        });

        const nextValues = Object.fromEntries(
          nextBalances.map((balance) => [balance.key, Number(balance.amount)])
        );
        const oldValues = previousBalances.current;

        if (announceChanges && Object.keys(oldValues).length > 0) {
          const changes = nextBalances.flatMap((balance) => {
            const difference = (nextValues[balance.key] ?? 0) - (oldValues[balance.key] ?? 0);
            return Math.abs(difference) < 0.00000005
              ? []
              : [{ id: Date.now() + Math.random(), code: balance.code, amount: difference }];
          });

          if (changes.length > 0) {
            setDeltas(changes);
            if (deltaTimer.current) clearTimeout(deltaTimer.current);
            deltaTimer.current = setTimeout(() => setDeltas([]), 4500);
          }
        }

        previousBalances.current = nextValues;
        setBalances(nextBalances);
        setError(null);
        setStreamStatus('live');
      } catch {
        setError('Unable to load balances from Horizon. Check the account and selected network.');
      }
    },
    []
  );

  useEffect(() => {
    if (!publicKey) return;

    let active = true;
    const server = new Server(getHorizonUrl(activeNetwork));
    previousBalances.current = {};
    setBalances([]);
    setDeltas([]);
    setError(null);
    setStreamStatus('connecting');

    const refresh = async (announceChanges: boolean) => {
      if (active) await refreshBalances(server, publicKey, announceChanges);
    };

    const closeStream = server.effects().forAccount(publicKey).cursor('now').stream({
      onmessage: () => void refresh(true),
      onerror: () => {
        if (active) setStreamStatus('reconnecting');
      },
    });

    void refresh(false);

    return () => {
      active = false;
      closeStream();
      if (deltaTimer.current) clearTimeout(deltaTimer.current);
    };
  }, [activeNetwork, publicKey, refreshBalances]);

  const handleRefresh = async () => {
    if (!publicKey) return;
    setIsRefreshing(true);
    await refreshBalances(new Server(getHorizonUrl(activeNetwork)), publicKey, true);
    setIsRefreshing(false);
  };

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-zinc-900 p-5" aria-live="polite">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Balances</h2>
          <p className="mt-1 text-xs text-gray-400">
            {streamStatus === 'live' ? 'Live from Horizon' : 'Horizon stream reconnecting'}
            {' · '}{activeNetwork}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="Refresh balances"
          title="Refresh balances"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      {balances.length > 0 ? (
        <ul className="divide-y divide-white/10">
          {balances.map((balance) => (
            <li key={balance.key} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-semibold text-white">{balance.code}</p>
                {balance.issuer && (
                  <p className="max-w-64 truncate font-mono text-xs text-gray-500" title={balance.issuer}>
                    {balance.issuer}
                  </p>
                )}
              </div>
              <p className="font-mono text-sm tabular-nums text-gray-100">{formatAmount(balance.amount)}</p>
            </li>
          ))}
        </ul>
      ) : (
        !error && <p className="text-sm text-gray-400">Loading account balances...</p>
      )}

      {deltas.length > 0 && (
        <div className="mt-4 space-y-2" role="status" aria-label="Recent balance changes">
          {deltas.map((delta) => (
            <p
              key={delta.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                delta.amount > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {delta.amount > 0 ? '+' : ''}{formatAmount(delta.amount)} {delta.code}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export default BalanceViewer;
