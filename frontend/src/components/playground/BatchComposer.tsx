'use client';

import { useMemo, useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import {
  BATCH_BASE_FEE,
  buildRollbackPreview,
  computeBatchTotals,
  createOperation,
  describeOperation,
  planExecution,
  reorderOperation,
  validateOperation,
  type BatchOperationDraft,
  type BatchOperationDraft as Draft,
} from '@/lib/batch-composer';
import { buildTransactionXdr, NETWORKS, type OperationSpec } from '@/lib/xdr-inspector';
import { getPublicEnv } from '@/lib/env';

const OPERATION_KINDS: BatchOperationDraft['type'][] = [
  'payment',
  'createAccount',
  'manageData',
  'approve',
  'transfer',
];

type SubmitState = 'idle' | 'signing' | 'submitting' | 'success' | 'error';

const FIELD_CLASS =
  'mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:outline-none';
const LABEL_CLASS = 'block text-[9px] font-bold tracking-widest text-zinc-500 uppercase';

interface BatchComposerProps {
  /** Testnet or public. Determines the passphrase used to sign. */
  network?: keyof typeof NETWORKS;
  /**
   * Sequence number to sign against. When omitted it is read from Horizon just
   * before building, because a stale sequence is rejected as `tx_bad_seq` and
   * the user would have no way to tell that apart from a real batch failure.
   */
  sequence?: string;
  /** Pre-fills the source account; otherwise taken from the wallet. */
  sourceAccount?: string;
}

/**
 * Compose several operations into one envelope and sign it with a single wallet
 * prompt (Issue #1320).
 *
 * The batch is built as one XDR envelope and handed to `signTransaction` exactly
 * once, which is the whole mechanism behind the one-prompt requirement: there is
 * only ever one thing to approve. Submitting is equally single-shot.
 *
 * The panel is honest about the part students get wrong most often — a Stellar
 * envelope is atomic, so a failure anywhere means nothing is applied. The
 * rollback preview spells that out instead of implying per-step undo.
 */
export default function BatchComposer({
  network = 'testnet',
  sequence,
  sourceAccount,
}: BatchComposerProps) {
  const { publicKey, signTransaction, isConnected } = useWallet();

  const [operations, setOperations] = useState<Draft[]>([]);
  const [nextId, setNextId] = useState(1);
  const [newKind, setNewKind] = useState<BatchOperationDraft['type']>('payment');
  const [failsAt, setFailsAt] = useState(0);
  const [status, setStatus] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string>('');

  const source = sourceAccount || publicKey || '';
  const totals = useMemo(() => computeBatchTotals(operations, BATCH_BASE_FEE), [operations]);
  const plan = useMemo(() => planExecution(operations), [operations]);
  const rollback = useMemo(() => buildRollbackPreview(operations, failsAt), [operations, failsAt]);

  const addOperation = useCallback(() => {
    setOperations((prev) => [...prev, createOperation(`op-${nextId}`, newKind)]);
    setNextId((n) => n + 1);
    setStatus('idle');
    setMessage('');
  }, [newKind, nextId]);

  const removeOperation = useCallback((id: string) => {
    setOperations((prev) => prev.filter((op) => op.id !== id));
    setStatus('idle');
  }, []);

  const moveOperation = useCallback((index: number, delta: number) => {
    setOperations((prev) => reorderOperation(prev, index, index + delta));
  }, []);

  const updateOperation = useCallback((id: string, patch: Partial<Draft>) => {
    setOperations((prev) => prev.map((op) => (op.id === id ? { ...op, ...patch } : op)));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!totals.valid) {
      setStatus('error');
      setMessage(totals.errors[0] ?? 'Fix the highlighted operations first');
      return;
    }

    let sequenceNumber = sequence;
    if (!sequenceNumber && source) {
      setMessage('Reading the account sequence…');
      try {
        sequenceNumber = await fetchSequence(source, network);
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error
            ? `Could not read the account sequence: ${error.message}`
            : 'Could not read the account sequence'
        );
        return;
      }
    }

    const spec: TransactionSpec = {
      sourceAccount: source,
      sequence: sequenceNumber,
      fee: BATCH_BASE_FEE,
      networkPassphrase: NETWORKS[network],
      memo: { type: 'none' },
      timeoutSeconds: 180,
      operations: operations.map((op) => {
        const { id: _id, label: _label, ...rest } = op;
        return rest;
      }),
    };

    const built = buildTransactionXdr(spec);
    if (!built.ok || !built.xdr) {
      setStatus('error');
      setMessage(built.error ?? 'Could not build the envelope');
      return;
    }

    try {
      setStatus('signing');
      setMessage(`Requesting one signature for ${built.operationCount} operations…`);
      // One call, one prompt. The whole batch is in this envelope already.
      const signedXdr = await signTransaction(built.xdr, {
        networkPassphrase: NETWORKS[network],
      });

      setStatus('submitting');
      setMessage('Signed. Submitting the envelope…');
      const response = await fetch(submitUrl(network), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signedXdr }).toString(),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail.slice(0, 200) || `Horizon returned ${response.status}`);
      }

      setStatus('success');
      setMessage(`Batch applied: ${built.operationCount} operations in one transaction.`);
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? `${error.message}. Nothing was applied — the batch is atomic.`
          : 'Signing or submission failed. Nothing was applied.'
      );
    }
  }, [network, operations, sequence, signTransaction, source, totals]);

  const disabled = !isConnected || operations.length === 0 || totals.valid === false;

  return (
    <section
      aria-label="Batch Composer"
      className="rounded-3xl border border-white/10 bg-zinc-950 p-6 sm:p-8"
    >
      <header className="mb-6">
        <h3 className="text-xs font-black tracking-widest text-white uppercase">Batch Composer</h3>
        <p className="mt-1 text-[10px] text-zinc-500">
          {operations.length} operation{operations.length === 1 ? '' : 's'} · one envelope · one
          signature
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="batch-new-op" className={LABEL_CLASS}>
            Add operation
          </label>
          <select
            id="batch-new-op"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as BatchOperationDraft['type'])}
            className={FIELD_CLASS}
          >
            {OPERATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={addOperation}
          className="rounded-xl bg-red-600 px-4 py-2 text-[10px] font-black tracking-widest text-white uppercase transition hover:bg-red-500"
          aria-label="Add operation to batch"
        >
          Add
        </button>
      </div>

      {operations.length === 0 ? (
        <p className="mb-5 rounded-xl border border-white/5 bg-black/30 px-4 py-6 text-center text-xs text-zinc-500">
          No operations yet. Add a payment, approval, transfer, or contract call to begin.
        </p>
      ) : (
        <ol className="mb-5 space-y-3" role="list">
          {operations.map((op, index) => (
            <li key={op.id} className="rounded-xl border border-white/5 bg-black/30 px-3 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-400">
                  {index + 1}
                </span>
                <span className="flex-grow truncate text-xs font-bold text-white">{op.label}</span>
                <button
                  onClick={() => moveOperation(index, -1)}
                  disabled={index === 0}
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Move operation ${index + 1} up`}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveOperation(index, 1)}
                  disabled={index === operations.length - 1}
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Move operation ${index + 1} down`}
                >
                  ↓
                </button>
                <button
                  onClick={() => removeOperation(op.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-400 transition hover:text-red-300"
                  aria-label={`Remove operation ${index + 1}`}
                >
                  ✕
                </button>
              </div>

              <p className="mb-2 text-[10px] text-zinc-400">{describeOperation(op)}</p>

              {op.type === 'payment' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label htmlFor={`${op.id}-dest`} className={LABEL_CLASS}>
                      Destination
                    </label>
                    <input
                      id={`${op.id}-dest`}
                      value={op.destination ?? ''}
                      onChange={(e) => updateOperation(op.id, { destination: e.target.value })}
                      placeholder="G…"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${op.id}-amount`} className={LABEL_CLASS}>
                      Amount
                    </label>
                    <input
                      id={`${op.id}-amount`}
                      value={op.amount ?? ''}
                      onChange={(e) => updateOperation(op.id, { amount: e.target.value })}
                      placeholder="10"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${op.id}-asset`} className={LABEL_CLASS}>
                      Asset
                    </label>
                    <input
                      id={`${op.id}-asset`}
                      value={op.assetCode ?? ''}
                      onChange={(e) => updateOperation(op.id, { assetCode: e.target.value })}
                      placeholder="XLM"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}

              {op.type === 'createAccount' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${op.id}-cadest`} className={LABEL_CLASS}>
                      New account
                    </label>
                    <input
                      id={`${op.id}-cadest`}
                      value={op.destination ?? ''}
                      onChange={(e) => updateOperation(op.id, { destination: e.target.value })}
                      placeholder="G…"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${op.id}-start`} className={LABEL_CLASS}>
                      Starting balance
                    </label>
                    <input
                      id={`${op.id}-start`}
                      value={op.startingBalance ?? ''}
                      onChange={(e) => updateOperation(op.id, { startingBalance: e.target.value })}
                      placeholder="10"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}

              {op.type === 'manageData' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${op.id}-name`} className={LABEL_CLASS}>
                      Name
                    </label>
                    <input
                      id={`${op.id}-name`}
                      value={op.name ?? ''}
                      onChange={(e) => updateOperation(op.id, { name: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${op.id}-value`} className={LABEL_CLASS}>
                      Value
                    </label>
                    <input
                      id={`${op.id}-value`}
                      value={op.value ?? ''}
                      onChange={(e) => updateOperation(op.id, { value: e.target.value })}
                      placeholder="empty deletes"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}

              {(op.type === 'approve' || op.type === 'transfer') && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label htmlFor={`${op.id}-token`} className={LABEL_CLASS}>
                      Token contract
                    </label>
                    <input
                      id={`${op.id}-token`}
                      value={op.tokenContract ?? ''}
                      onChange={(e) => updateOperation(op.id, { tokenContract: e.target.value })}
                      placeholder="C…"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${op.id}-amount`} className={LABEL_CLASS}>
                      Amount (stroops)
                    </label>
                    <input
                      id={`${op.id}-amount`}
                      value={op.amount ?? ''}
                      onChange={(e) => updateOperation(op.id, { amount: e.target.value })}
                      placeholder="25000000"
                      className={FIELD_CLASS}
                    />
                  </div>
                  {op.type === 'approve' ? (
                    <div>
                      <label htmlFor={`${op.id}-spender`} className={LABEL_CLASS}>
                        Spender
                      </label>
                      <input
                        id={`${op.id}-spender`}
                        value={op.spender ?? ''}
                        onChange={(e) => updateOperation(op.id, { spender: e.target.value })}
                        placeholder="G…"
                        className={FIELD_CLASS}
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor={`${op.id}-dest`} className={LABEL_CLASS}>
                        Recipient
                      </label>
                      <input
                        id={`${op.id}-dest`}
                        value={op.destination ?? ''}
                        onChange={(e) => updateOperation(op.id, { destination: e.target.value })}
                        placeholder="G…"
                        className={FIELD_CLASS}
                      />
                    </div>
                  )}
                </div>
              )}

              {validateRow(op) && (
                <p className="mt-2 text-[10px] text-yellow-500/90">{validateRow(op)}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mb-4 rounded-xl border border-white/5 bg-black/30 px-4 py-3">
        <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
          Batch summary
        </p>
        <p className="mt-1 font-mono text-[11px] text-zinc-400">
          {totals.operationCount} operation(s) · total fee {totals.totalFee} stroops (base fee ×{' '}
          {totals.operationCount})
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          One inclusion fee is paid for the whole envelope, and one signature approves it — that is
          why batching costs one prompt instead of {totals.operationCount}.
        </p>
      </div>

      <details className="mb-4">
        <summary className="cursor-pointer text-[10px] font-bold tracking-widest text-zinc-400 uppercase hover:text-zinc-200">
          Execution order
        </summary>
        <ol className="mt-2 space-y-1" role="list">
          {plan.map((step) => (
            <li key={step.index} className="text-[10px] text-zinc-400">
              <span className="font-mono text-zinc-600">{step.index + 1}.</span> {step.description}
              {step.dependsOn.length > 0 && (
                <span className="text-zinc-600"> (after {step.dependsOn.length} earlier)</span>
              )}
            </li>
          ))}
        </ol>
      </details>

      <details className="mb-4" open>
        <summary className="cursor-pointer text-[10px] font-bold tracking-widest text-zinc-400 uppercase hover:text-zinc-200">
          Rollback preview
        </summary>
        <div className="mt-2">
          <label htmlFor="batch-fails-at" className={LABEL_CLASS}>
            Simulate failure at operation
          </label>
          <select
            id="batch-fails-at"
            value={failsAt}
            onChange={(e) => setFailsAt(Number(e.target.value))}
            className={FIELD_CLASS}
          >
            {operations.map((op, index) => (
              <option key={op.id} value={index}>
                {index + 1} — {op.label}
              </option>
            ))}
          </select>
          <ul className="mt-2 space-y-1" role="list">
            {rollback.map((entry) => (
              <li key={entry.operationIndex} className="text-[10px] text-zinc-400">
                <span className="font-mono text-zinc-600">{entry.operationIndex + 1}.</span>{' '}
                {entry.note}
              </li>
            ))}
          </ul>
        </div>
      </details>

      {message && (
        <div
          role="alert"
          className={`mb-4 rounded-xl border px-4 py-3 text-xs ${
            status === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-white/10 bg-white/5 text-zinc-300'
          }`}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled || status === 'signing' || status === 'submitting'}
        className="w-full rounded-xl bg-red-600 py-3 text-[10px] font-black tracking-widest text-white uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Sign and submit batch as a single transaction"
      >
        {status === 'signing'
          ? 'Waiting for signature…'
          : status === 'submitting'
            ? 'Submitting…'
            : `Sign & Submit ${totals.operationCount} Operation${totals.operationCount === 1 ? '' : 's'}`}
      </button>

      {!isConnected && (
        <p className="mt-2 text-center text-[10px] text-zinc-600">Connect a wallet to sign.</p>
      )}
    </section>
  );
}

function validateRow(op: Draft): string {
  return validateOperation(op)[0] ?? '';
}

function accountUrl(network: keyof typeof NETWORKS): string {
  if (network === 'public') return 'https://horizon.stellar.org';
  return getPublicEnv().horizonUrl.replace(/\/$/, '');
}

/**
 * Read the source account's next sequence number.
 *
 * Signing against a stale sequence produces `tx_bad_seq`, which is easy to
 * misread as a problem with the batch itself. Fetching it immediately before
 * building keeps the failure modes distinguishable.
 */
async function fetchSequence(accountId: string, network: keyof typeof NETWORKS): Promise<string> {
  const response = await fetch(`${accountUrl(network)}/accounts/${accountId}`);
  if (!response.ok) {
    throw new Error(`Horizon returned ${response.status} for ${accountId}`);
  }
  const account = (await response.json()) as { sequence?: string | number };
  if (account.sequence === undefined) {
    throw new Error('Horizon returned no sequence for the source account');
  }
  return String(Number(account.sequence) + 1);
}

/**
 * Horizon submission endpoint for the selected network.
 *
 * Testnet reuses the configured public Horizon URL, so a self-hosted testnet
 * keeps working. Mainnet has no equivalent override and resolves to the public
 * endpoint, which is the one that must never be pointed at testnet XDR.
 */
function submitUrl(network: keyof typeof NETWORKS): string {
  return `${accountUrl(network)}/transactions`;
}
