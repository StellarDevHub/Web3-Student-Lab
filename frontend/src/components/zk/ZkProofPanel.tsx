'use client';

import { useState } from 'react';
import { Cpu, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { NETWORK_PASSPHRASES, useWallet } from '@/contexts/WalletContext';
import { useZkProof } from '@/hooks/useZkProof';
import { PROOF_STAGES, type CircuitArtifacts, type CircuitInput } from '@/lib/zk/proverProgress';
import { getZkVerifierContractId, submitProofToVerifier } from '@/lib/zk/submitProof';

/** Circom artifacts for the course-completion circuit, served as static files. */
export const DEFAULT_CIRCUIT_ARTIFACTS: CircuitArtifacts = {
  wasmUrl: process.env.NEXT_PUBLIC_ZK_CIRCUIT_WASM_URL || '/zk/course_completion.wasm',
  zkeyUrl: process.env.NEXT_PUBLIC_ZK_CIRCUIT_ZKEY_URL || '/zk/course_completion.zkey',
};

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'submitted'; txHash: string }
  | { status: 'error'; error: string };

function parseCircuitInput(raw: string): CircuitInput {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Witness input must be a JSON object of circuit signals.');
  }
  return parsed as CircuitInput;
}

/**
 * Private certificate verification: generates a Groth16 proof of course
 * completion in a Web Worker (no UI stutter) and submits it to the Soroban
 * `zk_proof_verifier` contract.
 */
export function ZkProofPanel({ artifacts = DEFAULT_CIRCUIT_ARTIFACTS }: { artifacts?: CircuitArtifacts }) {
  const { status, stage, progress, message, result, error, generateProof, cancel } = useZkProof();
  const wallet = useWallet();
  const [rawInput, setRawInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const verifierContractId = getZkVerifierContractId();
  const proving = status === 'proving';

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitState({ status: 'idle' });
    let input: CircuitInput;
    try {
      input = parseCircuitInput(rawInput);
      setInputError(null);
    } catch (parseError) {
      setInputError(parseError instanceof Error ? parseError.message : 'Invalid JSON.');
      return;
    }
    // Errors are surfaced through the hook's `error` state.
    await generateProof(input, artifacts).catch(() => undefined);
  }

  async function handleSubmitOnChain() {
    if (!result || !wallet.publicKey) return;
    setSubmitState({ status: 'submitting' });
    try {
      const { txHash } = await submitProofToVerifier({
        call: result.soroban,
        sourcePublicKey: wallet.publicKey,
        networkPassphrase: NETWORK_PASSPHRASES[wallet.activeNetwork],
        signTransaction: wallet.signTransaction,
      });
      setSubmitState({ status: 'submitted', txHash });
    } catch (submitError) {
      setSubmitState({
        status: 'error',
        error: submitError instanceof Error ? submitError.message : 'Submission failed.',
      });
    }
  }

  const activeIndex = PROOF_STAGES.findIndex((entry) => entry.stage === stage);

  return (
    <section
      aria-labelledby="zk-proof-heading"
      className="mt-8 rounded-[2rem] border border-white/5 bg-zinc-950/60 p-8 sm:p-12 backdrop-blur-md"
    >
      <h2
        id="zk-proof-heading"
        className="mb-2 flex items-center gap-2 text-xl font-black uppercase tracking-widest text-white"
      >
        <Cpu className="h-5 w-5 text-red-500" aria-hidden="true" />
        Private completion proof
      </h2>
      <p className="mb-6 text-sm text-gray-400">
        Prove course completion with a zero-knowledge proof. The proof is generated in a background
        worker on this device; your witness never leaves the browser.
      </p>

      <form onSubmit={handleGenerate} className="space-y-4">
        <label
          htmlFor="zk-witness-input"
          className="block text-[10px] font-black uppercase tracking-[0.2em] text-red-500"
        >
          Witness input (JSON)
        </label>
        <textarea
          id="zk-witness-input"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          rows={4}
          spellCheck={false}
          disabled={proving}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? 'zk-witness-input-error' : undefined}
          placeholder='{"courseHash": "…", "secret": "…"}'
          className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 font-mono text-xs text-white outline-none focus:border-red-500/50"
        />
        {inputError && (
          <p id="zk-witness-input-error" role="alert" className="text-xs text-red-400">
            {inputError}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={proving || !rawInput.trim()}
            className="rounded-2xl bg-red-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {proving ? 'Generating proof…' : 'Generate proof'}
          </button>
          {proving && (
            <button
              type="button"
              onClick={cancel}
              className="rounded-2xl border border-white/10 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {status !== 'idle' && (
        <div className="mt-6" aria-live="polite">
          <div
            role="progressbar"
            aria-label="Proof generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={message ?? undefined}
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Proof generation steps">
            {PROOF_STAGES.map((entry, index) => {
              const done = stage === 'done' || (activeIndex !== -1 && index < activeIndex);
              const active = index === activeIndex && proving;
              return (
                <li
                  key={entry.stage}
                  aria-current={active ? 'step' : undefined}
                  data-state={done ? 'done' : active ? 'active' : 'pending'}
                  className={`flex items-center gap-2 text-xs ${
                    done ? 'text-green-400' : active ? 'text-white' : 'text-gray-500'
                  }`}
                >
                  {active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {entry.label}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {status === 'error' && error && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-red-400">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </p>
      )}

      {status === 'success' && result && (
        <div className="mt-6 space-y-3 text-xs text-gray-400">
          <p className="font-bold text-green-400">Proof generated.</p>
          <p className="break-all font-mono">course_hash: {result.soroban.courseHash}</p>
          <p className="break-all font-mono">nullifier: {result.soroban.nullifier}</p>

          {!verifierContractId ? (
            <p>On-chain verification is not configured for this deployment.</p>
          ) : !wallet.publicKey ? (
            <p>Connect a wallet to submit the proof to the Soroban verifier.</p>
          ) : (
            <button
              type="button"
              onClick={handleSubmitOnChain}
              disabled={submitState.status === 'submitting' || submitState.status === 'submitted'}
              className="rounded-2xl bg-white/10 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
            >
              {submitState.status === 'submitting' ? 'Verifying on-chain…' : 'Verify proof on Soroban'}
            </button>
          )}
          {submitState.status === 'submitted' && (
            <p role="status" className="text-green-400">
              Verified on-chain. Transaction: <span className="break-all font-mono">{submitState.txHash}</span>
            </p>
          )}
          {submitState.status === 'error' && (
            <p role="alert" className="text-red-400">
              {submitState.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default ZkProofPanel;
