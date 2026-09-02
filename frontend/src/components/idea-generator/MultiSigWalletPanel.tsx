'use client';

import { useState } from 'react';
import {
  createMultiSigState,
  toggleSigner,
  MULTISIG_POLICIES,
  type MultiSigPolicy,
  type MultiSigState,
} from '@/lib/idea-generator/ideaGenerator';

/**
 * MultiSigWalletPanel — interactive simulator for multi-sig wallet concepts.
 *
 * Lets students configure an m-of-n signer quorum and simulate the approval
 * flow that would occur in a Soroban multi-sig contract. Purely client-side;
 * no network calls.
 */
export default function MultiSigWalletPanel() {
  const [numSigners, setNumSigners] = useState(3);
  const [threshold, setThreshold] = useState(2);
  const [policy, setPolicy] = useState<MultiSigPolicy>('m-of-n');
  const [wallet, setWallet] = useState<MultiSigState>(() =>
    createMultiSigState(3, 2, 'm-of-n'),
  );

  const handleConfigure = () => {
    setWallet(createMultiSigState(numSigners, Math.min(threshold, numSigners), policy));
  };

  const handleToggleSigner = (index: number) => {
    setWallet((prev) => toggleSigner(prev, index));
  };

  const signedCount = wallet.signers.filter((s) => s.signed).length;

  return (
    <section
      aria-label="Multi-sig Wallet Simulator"
      className="bg-bg-secondary border-border-theme space-y-6 rounded-2xl border p-6"
    >
      <div>
        <h2 className="text-foreground mb-1 text-lg font-black tracking-tight uppercase">
          Multi-sig Wallet <span className="text-red-500">Simulator</span>
        </h2>
        <p className="text-text-secondary text-xs tracking-wide">
          Configure signers and policy, then simulate the approval flow.
        </p>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="ms-signers"
            className="text-text-secondary mb-1 block text-[10px] font-bold tracking-widest uppercase"
          >
            Signers
          </label>
          <input
            id="ms-signers"
            type="number"
            min={2}
            max={10}
            value={numSigners}
            onChange={(e) => setNumSigners(Number(e.target.value))}
            className="bg-background border-border-theme text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label
            htmlFor="ms-threshold"
            className="text-text-secondary mb-1 block text-[10px] font-bold tracking-widest uppercase"
          >
            Threshold (m)
          </label>
          <input
            id="ms-threshold"
            type="number"
            min={1}
            max={numSigners}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-background border-border-theme text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label
            htmlFor="ms-policy"
            className="text-text-secondary mb-1 block text-[10px] font-bold tracking-widest uppercase"
          >
            Policy
          </label>
          <select
            id="ms-policy"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as MultiSigPolicy)}
            className="bg-background border-border-theme text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-red-500"
          >
            {MULTISIG_POLICIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleConfigure}
        className="w-full rounded-xl border border-red-600 py-2 text-xs font-black tracking-[0.2em] text-red-500 uppercase transition-colors hover:bg-red-600 hover:text-white"
      >
        Apply Configuration
      </button>

      {/* Signer list */}
      <fieldset>
        <legend className="text-text-secondary mb-3 text-[10px] font-bold tracking-widest uppercase">
          Signers — click to sign/unsign
        </legend>
        <ul className="space-y-2" aria-label="Signers">
          {wallet.signers.map((signer, idx) => (
            <li key={signer.address}>
              <button
                type="button"
                onClick={() => handleToggleSigner(idx)}
                aria-pressed={signer.signed}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-mono transition-colors ${
                  signer.signed
                    ? 'border-red-600 bg-red-600/10 text-red-400'
                    : 'border-border-theme text-text-secondary hover:border-red-600/50'
                }`}
              >
                <span>{signer.address}</span>
                <span
                  className={`text-[10px] font-black tracking-widest uppercase ${
                    signer.signed ? 'text-red-400' : 'text-zinc-600'
                  }`}
                >
                  {signer.signed ? '✓ Signed' : 'Pending'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      {/* Status bar */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border p-4 text-center transition-colors ${
          wallet.approved
            ? 'border-green-600 bg-green-600/10'
            : 'border-border-theme bg-background'
        }`}
      >
        <p className="text-xs font-bold tracking-widest uppercase">
          {signedCount} / {wallet.signers.length} signed &mdash; threshold:{' '}
          {wallet.threshold}
        </p>
        <p
          className={`mt-1 text-sm font-black tracking-tight uppercase ${
            wallet.approved ? 'text-green-400' : 'text-text-secondary'
          }`}
        >
          {wallet.approved ? '🔓 Transaction Approved' : '🔒 Awaiting Signatures'}
        </p>
        <p className="text-text-secondary mt-1 text-[10px] tracking-widest uppercase">
          Policy: {wallet.policy}
        </p>
      </div>
    </section>
  );
}
