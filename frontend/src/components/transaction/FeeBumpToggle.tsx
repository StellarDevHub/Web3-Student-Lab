'use client';

import React from 'react';
import { useFeeBump } from '../../hooks/useFeeBump';
import { RelayerSponsorConfig } from '../../services/stellar/feeBumpService';

export interface FeeBumpToggleProps {
  studentBalanceXlm: number;
  innerFeeStroops?: number;
  relayerConfig?: RelayerSponsorConfig;
  onChangeMode?: (mode: 'sponsored' | 'self-pay') => void;
}

export const FeeBumpToggle: React.FC<FeeBumpToggleProps> = ({
  studentBalanceXlm,
  innerFeeStroops = 100,
  relayerConfig,
  onChangeMode,
}) => {
  const { enabled, setEnabled, isZeroBalanceStudent, breakdown } = useFeeBump({
    studentBalanceXlm,
    innerFeeStroops,
    relayerConfig,
  });

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (onChangeMode) {
      onChangeMode(next ? 'sponsored' : 'self-pay');
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-4 text-sm text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-white">
            Stellar Fee Bump Sponsorship
          </h4>
          <p className="text-xs text-slate-400">
            Wraps signed exercise transactions so lab relayer covers network fees.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          data-testid="fee-bump-switch"
          onClick={handleToggle}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            enabled
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {enabled ? 'Sponsored ON' : 'Self-Pay'}
        </button>
      </div>

      {isZeroBalanceStudent && (
        <p
          data-testid="zero-xlm-student-banner"
          className="mt-2 rounded bg-indigo-950/80 px-2.5 py-1 text-xs text-indigo-200"
        >
          0 XLM balance detected — Fee Bump sponsorship automatically enabled for exercise verification.
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-xs">
        <div>
          <dt className="text-slate-400">Sponsor Address</dt>
          <dd data-testid="sponsor-address" className="truncate font-mono text-slate-200">
            {breakdown.sponsorAddress ?? 'Self (Student Account)'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Max Fee Limit</dt>
          <dd data-testid="max-fee-limit" className="font-mono text-slate-200">
            {breakdown.maxFeeLimitStroops} stroops
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Inner Tx Base Fee</dt>
          <dd className="font-mono text-slate-200">{breakdown.innerFeeStroops} stroops</dd>
        </div>
        <div>
          <dt className="text-slate-400">Student Fee Cost</dt>
          <dd data-testid="student-fee-cost" className="font-semibold text-emerald-400">
            {breakdown.studentCostStroops} stroops
          </dd>
        </div>
      </dl>

      {breakdown.fallbackReason && (
        <div
          role="alert"
          data-testid="fee-bump-fallback-alert"
          className="mt-3 rounded border border-amber-500/50 bg-amber-950/70 px-3 py-2 text-xs text-amber-200"
        >
          {breakdown.fallbackReason}
        </div>
      )}
    </div>
  );
};
