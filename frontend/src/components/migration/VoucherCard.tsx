'use client';

import React from 'react';
import { MigrationVoucher } from '@/hooks/useTokenMigration';

interface VoucherCardProps {
  voucher: MigrationVoucher;
  isSelected: boolean;
  onSelect: (voucherId: string) => void;
  disabled?: boolean;
}

export function VoucherCard({
  voucher,
  isSelected,
  onSelect,
  disabled = false,
}: VoucherCardProps) {
  const { legacyToken, migratedToken, ratio, deadline, bonusPercentage } = voucher;
  const ratioString = `${ratio.numerator}:${ratio.denominator}`;
  const daysLeft = Math.max(0, Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24)));
  const balanceNum = parseFloat(legacyToken.balance);
  const hasBalance = balanceNum > 0;

  return (
    <div
      onClick={() => !disabled && onSelect(voucher.id)}
      className={`relative cursor-pointer rounded-xl border p-5 transition-all duration-200 ${
        isSelected
          ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10'
          : 'border-slate-700/60 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/40'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-100">{voucher.title}</h4>
            {bonusPercentage && bonusPercentage > 0 ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                +{bonusPercentage}% Bonus
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-400">{voucher.description}</p>
        </div>

        <div className="flex flex-col items-end">
          <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-mono font-medium text-indigo-400 border border-slate-700">
            Ratio {ratioString}
          </span>
          <span className="mt-1 text-[11px] text-slate-400">
            {daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-950/40 p-3 border border-slate-800/80">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Legacy Token (Burn)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold text-slate-200">{legacyToken.symbol}</span>
            <span className="text-xs text-slate-400 truncate max-w-[90px]" title={legacyToken.contractId}>
              {legacyToken.contractId.slice(0, 4)}...{legacyToken.contractId.slice(-4)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-300">
            Balance: <span className={hasBalance ? 'text-emerald-400 font-medium' : 'text-slate-400'}>{legacyToken.balance}</span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Migrated Token (Mint)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold text-indigo-300">{migratedToken.symbol}</span>
            <span className="text-xs text-slate-400 truncate max-w-[90px]" title={migratedToken.contractId}>
              {migratedToken.contractId.slice(0, 4)}...{migratedToken.contractId.slice(-4)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-300">
            Current: <span>{migratedToken.balance}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-slate-400">
          Min: {voucher.minAmount} {legacyToken.symbol}
        </span>
        <span className={`font-medium ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`}>
          {isSelected ? 'Selected' : 'Click to select'}
        </span>
      </div>
    </div>
  );
}
