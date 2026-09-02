'use client';

/**
 * Transaction builder and XDR envelope inspector (Issue #1161).
 *
 * The claim the page is built to demonstrate: a transaction and its Base64 XDR
 * are the same object in two spellings. Every edit rebuilds the envelope, and
 * the decoded view is produced by parsing that envelope back — not by echoing
 * the form state — so if they ever disagree, the tool shows it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Networks } from '@stellar/stellar-sdk';

import {
  buildTransactionXdr,
  decodeEnvelope,
  emptySpec,
  randomKeypair,
  verifyRoundTrip,
  type OperationSpec,
  type SupportedOperation,
  type TransactionSpec,
} from '@/lib/xdr-inspector';

const OPERATION_TYPES: { value: SupportedOperation; label: string }[] = [
  { value: 'payment', label: 'Payment' },
  { value: 'createAccount', label: 'Create Account' },
  { value: 'manageData', label: 'Manage Data' },
  { value: 'invokeHostFunction', label: 'Invoke Host Function (Soroban)' },
];

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const SOROBAN_TESTNET = 'https://soroban-testnet.stellar.org';

let nextOperationId = 1;

export default function XdrInspectorPage() {
  const [keys, setKeys] = useState(() => randomKeypair());
  const [spec, setSpec] = useState<TransactionSpec>(() => emptySpec());
  const [pastedXdr, setPastedXdr] = useState('');
  const [signing, setSigning] = useState(false);
  const [network, setNetwork] = useState<'testnet' | 'public'>('testnet');
  const [submitState, setSubmitState] = useState<
    { status: 'idle' } | { status: 'working'; message: string } | { status: 'done'; message: string; hash?: string; ok: boolean }
  >({ status: 'idle' });

  // Seed the source account once the keypair exists.
  useEffect(() => {
    setSpec((prev) => ({ ...prev, sourceAccount: keys.publicKey }));
  }, [keys.publicKey]);

  const passphrase = network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;

  const built = useMemo(
    () => buildTransactionXdr({ ...spec, networkPassphrase: passphrase }, signing ? keys.secret : undefined),
    [spec, passphrase, signing, keys.secret]
  );

  // Decode whatever the student pasted if there is anything, otherwise decode
  // what we just built. Same function either way — that is the point.
  const decodeSource = pastedXdr.trim() || built.xdr || '';
  const decoded = useMemo(
    () => (decodeSource ? decodeEnvelope(decodeSource, passphrase) : null),
    [decodeSource, passphrase]
  );

  const roundTrip = useMemo(
    () => verifyRoundTrip({ ...spec, networkPassphrase: passphrase }),
    [spec, passphrase]
  );

  const addOperation = useCallback((type: SupportedOperation) => {
    setSpec((prev) => ({
      ...prev,
      operations: [...prev.operations, { id: `op-${nextOperationId++}`, type }],
    }));
  }, []);

  function updateOperation(id: string, patch: Partial<OperationSpec>) {
    setSpec((prev) => ({
      ...prev,
      operations: prev.operations.map((op) => (op.id === id ? { ...op, ...patch } : op)),
    }));
  }

  function removeOperation(id: string) {
    setSpec((prev) => ({ ...prev, operations: prev.operations.filter((op) => op.id !== id) }));
  }

  /**
   * Simulate against Soroban RPC, then submit to Horizon.
   *
   * Simulation is worth doing first even for classic operations: it is where
   * authorization and precondition failures surface, and finding them here
   * costs nothing while finding them at submission costs a fee.
   */
  async function handleSubmit() {
    if (!built.ok || !built.xdr) return;
    if (network !== 'testnet') {
      setSubmitState({ status: 'done', ok: false, message: 'Submission is restricted to testnet.' });
      return;
    }

    try {
      setSubmitState({ status: 'working', message: 'Funding the source account with Friendbot…' });
      // A brand-new keypair has no account on-chain, so sequence 0 would be
      // rejected. Friendbot creates and funds it on testnet.
      await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(keys.publicKey)}`).catch(() => null);

      setSubmitState({ status: 'working', message: 'Fetching the current sequence number…' });
      const accountResponse = await fetch(`${HORIZON_TESTNET}/accounts/${keys.publicKey}`);
      if (!accountResponse.ok) {
        setSubmitState({
          status: 'done',
          ok: false,
          message: 'Could not load the source account. It may not be funded yet — try again in a moment.',
        });
        return;
      }
      const account = await accountResponse.json();

      // Rebuild at the live sequence: the form's sequence is for teaching, but
      // the network will reject anything that is not exactly next.
      const live = buildTransactionXdr(
        { ...spec, sourceAccount: keys.publicKey, sequence: account.sequence, networkPassphrase: Networks.TESTNET },
        keys.secret
      );
      if (!live.ok || !live.xdr) {
        setSubmitState({ status: 'done', ok: false, message: live.error ?? 'Build failed' });
        return;
      }

      setSubmitState({ status: 'working', message: 'Simulating…' });
      const simulation = await fetch(SOROBAN_TESTNET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'simulateTransaction',
          params: { transaction: live.xdr },
        }),
      })
        .then((r) => r.json())
        .catch(() => null);

      const simError = simulation?.result?.error;
      if (simError) {
        setSubmitState({
          status: 'done',
          ok: false,
          message: `Simulation rejected this transaction: ${simError}. Nothing was submitted, so no fee was spent.`,
        });
        return;
      }

      setSubmitState({ status: 'working', message: 'Submitting to testnet…' });
      const submission = await fetch(`${HORIZON_TESTNET}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: live.xdr }),
      });
      const result = await submission.json();

      if (submission.ok && result.hash) {
        setSubmitState({ status: 'done', ok: true, message: 'Included in a ledger.', hash: result.hash });
      } else {
        const codes = result?.extras?.result_codes;
        setSubmitState({
          status: 'done',
          ok: false,
          message: codes
            ? `Rejected: ${codes.transaction ?? ''} ${(codes.operations ?? []).join(', ')}`.trim()
            : result?.detail ?? 'Submission failed',
        });
      }
    } catch (error) {
      setSubmitState({
        status: 'done',
        ok: false,
        message: error instanceof Error ? error.message : 'Submission failed',
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Transaction Builder &amp; XDR Inspector</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Assemble a multi-operation transaction, watch the Base64 XDR envelope change as you edit,
          and decode it back into fields. The two views are the same object — the decoded panel is
          produced by parsing the envelope, not by echoing the form.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Builder ─────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Build</h2>

          <div className="space-y-3 text-xs">
            <div>
              <label htmlFor="source" className="block text-zinc-500">Source account</label>
              <input
                id="source"
                value={spec.sourceAccount}
                onChange={(e) => setSpec({ ...spec, sourceAccount: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-100"
              />
              <button
                type="button"
                onClick={() => setKeys(randomKeypair())}
                className="mt-1 text-[11px] text-emerald-400 underline"
              >
                generate a new test keypair
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="seq" className="block text-zinc-500">Sequence</label>
                <input
                  id="seq"
                  value={spec.sequence}
                  onChange={(e) => setSpec({ ...spec, sequence: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-100"
                />
              </div>
              <div>
                <label htmlFor="fee" className="block text-zinc-500">Fee per operation (stroops)</label>
                <input
                  id="fee"
                  value={spec.fee}
                  onChange={(e) => setSpec({ ...spec, fee: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="net" className="block text-zinc-500">Network</label>
                <select
                  id="net"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value as 'testnet' | 'public')}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100"
                >
                  <option value="testnet">Testnet</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div>
                <label htmlFor="memo" className="block text-zinc-500">Memo (text)</label>
                <input
                  id="memo"
                  value={spec.memo?.value ?? ''}
                  onChange={(e) =>
                    setSpec({ ...spec, memo: { type: e.target.value ? 'text' : 'none', value: e.target.value } })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* Operations */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-300">Operations</span>
              {OPERATION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => addOperation(t.value)}
                  className="rounded border border-white/15 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                >
                  + {t.label}
                </button>
              ))}
            </div>

            {spec.operations.length === 0 && (
              <p className="text-xs text-zinc-600">
                A transaction needs at least one operation. Add one above.
              </p>
            )}

            <div className="space-y-3">
              {spec.operations.map((op, index) => (
                <div key={op.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">
                      #{index} · {OPERATION_TYPES.find((t) => t.value === op.type)?.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOperation(op.id)}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      remove
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {(op.type === 'payment' || op.type === 'createAccount') && (
                      <input
                        placeholder="destination (G…)"
                        value={op.destination ?? ''}
                        onChange={(e) => updateOperation(op.id, { destination: e.target.value })}
                        className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                      />
                    )}
                    {op.type === 'payment' && (
                      <>
                        <input
                          placeholder="amount"
                          value={op.amount ?? ''}
                          onChange={(e) => updateOperation(op.id, { amount: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                        <input
                          placeholder="asset code (blank = XLM)"
                          value={op.assetCode ?? ''}
                          onChange={(e) => updateOperation(op.id, { assetCode: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                        <input
                          placeholder="asset issuer (non-native only)"
                          value={op.assetIssuer ?? ''}
                          onChange={(e) => updateOperation(op.id, { assetIssuer: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                      </>
                    )}
                    {op.type === 'createAccount' && (
                      <input
                        placeholder="starting balance"
                        value={op.startingBalance ?? ''}
                        onChange={(e) => updateOperation(op.id, { startingBalance: e.target.value })}
                        className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                      />
                    )}
                    {op.type === 'manageData' && (
                      <>
                        <input
                          placeholder="entry name"
                          value={op.name ?? ''}
                          onChange={(e) => updateOperation(op.id, { name: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                        <input
                          placeholder="value (blank deletes the entry)"
                          value={op.value ?? ''}
                          onChange={(e) => updateOperation(op.id, { value: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                      </>
                    )}
                    {op.type === 'invokeHostFunction' && (
                      <>
                        <input
                          placeholder="contract id (C…)"
                          value={op.contractId ?? ''}
                          onChange={(e) => updateOperation(op.id, { contractId: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                        <input
                          placeholder="function name"
                          value={op.functionName ?? ''}
                          onChange={(e) => updateOperation(op.id, { functionName: e.target.value })}
                          className="rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100"
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={signing} onChange={(e) => setSigning(e.target.checked)} />
            Sign with the test key
          </label>

          {built.ok && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Envelope fee is {built.totalFee} stroops — {spec.fee} × {built.operationCount}{' '}
              operation{built.operationCount === 1 ? '' : 's'}. The fee on a transaction is the
              total, not the per-operation figure you entered.
            </p>
          )}
        </section>

        {/* ── XDR + decode ────────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">Base64 XDR envelope</h2>

            {built.ok ? (
              <textarea
                readOnly
                value={built.xdr}
                rows={5}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed text-emerald-200"
              />
            ) : (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
                {built.error}
              </p>
            )}

            <div
              className={`mt-3 rounded-lg border p-2 text-[11px] ${
                roundTrip.ok
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              Round trip: {roundTrip.detail}
            </div>

            <label htmlFor="paste" className="mt-4 block text-xs text-zinc-500">
              Or paste an envelope to decode instead
            </label>
            <textarea
              id="paste"
              value={pastedXdr}
              onChange={(e) => setPastedXdr(e.target.value)}
              rows={3}
              placeholder="AAAAAg…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-100"
            />

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!built.ok || submitState.status === 'working' || network !== 'testnet'}
              className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              {submitState.status === 'working' ? submitState.message : 'Simulate & submit to testnet'}
            </button>

            {submitState.status === 'done' && (
              <div
                className={`mt-2 rounded-lg border p-2 text-[11px] ${
                  submitState.ok
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-400/30 bg-red-500/10 text-red-200'
                }`}
              >
                {submitState.message}
                {submitState.hash && (
                  <>
                    {' '}
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${submitState.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      view {submitState.hash.slice(0, 12)}…
                    </a>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">Decoded</h2>

            {!decoded ? (
              <p className="text-xs text-zinc-600">Nothing to decode yet.</p>
            ) : !decoded.ok ? (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
                {decoded.error}
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <dl className="grid grid-cols-[110px_1fr] gap-y-1 font-mono text-[11px]">
                  <dt className="text-zinc-500">source</dt>
                  <dd className="truncate text-zinc-200">{decoded.sourceAccount}</dd>
                  <dt className="text-zinc-500">sequence</dt>
                  <dd className="text-zinc-200">{decoded.sequence}</dd>
                  <dt className="text-zinc-500">fee</dt>
                  <dd className="text-zinc-200">{decoded.fee}</dd>
                  <dt className="text-zinc-500">memo</dt>
                  <dd className="text-zinc-200">
                    {decoded.memo?.type}
                    {decoded.memo?.value ? ` · ${decoded.memo.value}` : ''}
                  </dd>
                  <dt className="text-zinc-500">signatures</dt>
                  <dd className="text-zinc-200">{decoded.signatureCount}</dd>
                  <dt className="text-zinc-500">hash</dt>
                  <dd className="truncate text-amber-200">{decoded.transactionHash}</dd>
                </dl>

                <div className="space-y-2">
                  {decoded.operations?.map((op) => (
                    <div key={op.index} className="rounded-lg border border-white/10 bg-zinc-950/60 p-2">
                      <div className="text-[11px] text-emerald-300">
                        #{op.index} {op.type}
                      </div>
                      <dl className="mt-1 grid grid-cols-[90px_1fr] gap-y-0.5 font-mono text-[10px]">
                        {Object.entries(op.details).map(([key, value]) => (
                          <div key={key} className="contents">
                            <dt className="text-zinc-600">{key}</dt>
                            <dd className="truncate text-zinc-300">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-zinc-500">
                  The hash above is network-specific: signatures commit to a value that includes the
                  network passphrase. Switch the network selector and it changes, without the
                  envelope changing at all — that is what stops a testnet transaction being replayed
                  on the public network.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
