'use client';

import React, { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useTokenMigration, MigrationVoucher } from '@/hooks/useTokenMigration';
import { VoucherCard } from './VoucherCard';

export function MigrationWizard() {
  const { publicKey, connect } = useWallet();
  const {
    vouchers,
    selectedVoucher,
    selectedVoucherId,
    setSelectedVoucherId,
    currentStep,
    setCurrentStep,
    burnTxHash,
    mintTxHash,
    latestReceipt,
    isLoading,
    isScanning,
    error,
    clearError,
    calculateMigratedAmount,
    approveAndBurnLegacy,
    mintMigratedToken,
    resetWizard,
  } = useTokenMigration();

  const [inputAmount, setInputAmount] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(label);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleMaxClick = () => {
    if (selectedVoucher) {
      setInputAmount(selectedVoucher.legacyToken.balance);
    }
  };

  const handleBurnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVoucher || !inputAmount) return;
    try {
      await approveAndBurnLegacy(selectedVoucher.id, inputAmount);
    } catch {
      // Error handled in hook
    }
  };

  const handleMintSubmit = async () => {
    if (!selectedVoucher || !inputAmount) return;
    try {
      await mintMigratedToken(selectedVoucher.id, inputAmount);
    } catch {
      // Error handled in hook
    }
  };

  const expectedMigratedAmount = calculateMigratedAmount(inputAmount, selectedVoucher);

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Token Migration Voucher Portal
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Upgrade deprecated testnet contracts, burn legacy assets, and mint audited v2 equivalents.
            </p>
          </div>
          {publicKey ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{publicKey.slice(0, 4)}...{publicKey.slice(-4)}</span>
            </div>
          ) : (
            <button
              onClick={() => connect('Freighter')}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-500"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Step Indicator */}
        <div className="mt-6 flex items-center justify-between max-w-md">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                currentStep === 'select' || currentStep === 'burn'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              1
            </span>
            <span className="text-xs font-medium text-slate-300">Approve & Burn</span>
          </div>

          <div className="h-0.5 flex-1 mx-3 bg-slate-800" />

          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                currentStep === 'mint'
                  ? 'bg-indigo-600 text-white'
                  : currentStep === 'receipt'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              2
            </span>
            <span className="text-xs font-medium text-slate-300">Mint Migrated Token</span>
          </div>

          <div className="h-0.5 flex-1 mx-3 bg-slate-800" />

          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                currentStep === 'receipt' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              3
            </span>
            <span className="text-xs font-medium text-slate-300">Receipt</span>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error ? (
        <div className="mt-5 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold underline hover:text-white">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Step 1: Select voucher and burn */}
      {(currentStep === 'select' || currentStep === 'burn') && (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              1. Choose Migration Voucher
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {vouchers.map((voucher) => (
                <VoucherCard
                  key={voucher.id}
                  voucher={voucher}
                  isSelected={voucher.id === selectedVoucherId}
                  onSelect={(id) => {
                    setSelectedVoucherId(id);
                    setInputAmount('');
                  }}
                  disabled={isLoading}
                />
              ))}
            </div>
          </div>

          {selectedVoucher && (
            <form onSubmit={handleBurnSubmit} className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                2. Specify Amount to Burn & Upgrade
              </h3>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Amount ({selectedVoucher.legacyToken.symbol})</span>
                  <span>Available: {selectedVoucher.legacyToken.balance}</span>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    disabled={isLoading || !publicKey}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    disabled={isLoading || !publicKey}
                    className="absolute right-2 top-2 rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-indigo-400 hover:bg-slate-700 transition"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="mt-4 rounded-lg bg-slate-900/80 p-3 border border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">You will receive:</span>
                <span className="font-semibold text-emerald-400 text-sm">
                  {expectedMigratedAmount} {selectedVoucher.migratedToken.symbol}
                </span>
              </div>

              <div className="mt-5">
                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    !publicKey ||
                    !inputAmount ||
                    parseFloat(inputAmount) <= 0 ||
                    parseFloat(inputAmount) > parseFloat(selectedVoucher.legacyToken.balance)
                  }
                  className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Authorizing & Burning Legacy Tokens...' : 'Step 1: Approve & Burn Legacy'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Step 2: Mint Migrated Token */}
      {currentStep === 'mint' && selectedVoucher && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
            <p className="font-medium">Step 1 Complete: Legacy tokens successfully burned!</p>
            <p className="mt-1 font-mono text-[11px] text-emerald-400 truncate">
              Burn Tx Hash: {burnTxHash}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Claim Migrated v2 Tokens
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Your conversion voucher is verified on-chain. Complete the upgrade to mint your new SEP-41 tokens.
            </p>

            <div className="mt-5 space-y-3 rounded-lg bg-slate-900 p-4 border border-slate-800">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Burned Asset:</span>
                <span className="font-medium text-slate-200">{inputAmount} {selectedVoucher.legacyToken.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Conversion Rate:</span>
                <span className="font-medium text-slate-200">
                  {selectedVoucher.ratio.numerator}:{selectedVoucher.ratio.denominator}
                </span>
              </div>
              <div className="flex justify-between text-xs border-t border-slate-800 pt-3">
                <span className="text-slate-300 font-medium">Minting Total:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {expectedMigratedAmount} {selectedVoucher.migratedToken.symbol}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleMintSubmit}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isLoading ? 'Minting Migrated Tokens on Soroban...' : 'Step 2: Mint Migrated Token'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Detailed Receipt Screen */}
      {currentStep === 'receipt' && latestReceipt && (
        <div className="mt-6 space-y-6">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-3 text-lg font-bold text-white">Migration Complete!</h3>
            <p className="mt-1 text-xs text-slate-400">
              Both burn and mint operations have been successfully finalized on Stellar {latestReceipt.network}.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] text-slate-400">Tokens Burned</span>
                <p className="mt-0.5 text-base font-bold text-rose-400">
                  -{latestReceipt.burnedAmount} {latestReceipt.legacySymbol}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Tokens Minted</span>
                <p className="mt-0.5 text-base font-bold text-emerald-400">
                  +{latestReceipt.mintedAmount} {latestReceipt.migratedSymbol}
                </p>
              </div>
            </div>

            {/* Transaction Hashes */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">1. Burn Transaction Hash</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(latestReceipt.burnTxHash, 'burn')}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {copiedHash === 'burn' ? 'Copied!' : 'Copy'}
                    </button>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${latestReceipt.burnTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 underline hover:text-slate-200"
                    >
                      View Explorer ↗
                    </a>
                  </div>
                </div>
                <div className="mt-1 rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-300 truncate">
                  {latestReceipt.burnTxHash}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">2. Mint Transaction Hash</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(latestReceipt.mintTxHash, 'mint')}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {copiedHash === 'mint' ? 'Copied!' : 'Copy'}
                    </button>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${latestReceipt.mintTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 underline hover:text-slate-200"
                    >
                      View Explorer ↗
                    </a>
                  </div>
                </div>
                <div className="mt-1 rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-300 truncate">
                  {latestReceipt.mintTxHash}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 flex justify-between">
              <span>Timestamp: {new Date(latestReceipt.timestamp).toLocaleString()}</span>
              <span>Status: Finalized</span>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => {
                resetWizard();
                setInputAmount('');
              }}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Perform Another Migration
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
