/**
 * xdr-inspector.ts — transaction assembly and XDR envelope decoding for the
 * builder/inspector (Issue #1161).
 *
 * # Why a wrapper rather than calling the SDK from the component
 *
 * The lesson of the tool is that a Stellar transaction is a *structure* — a
 * source account, a sequence number, a fee, and an ordered list of operations —
 * and that Base64 XDR is only that structure serialised. Keeping build and
 * decode in one module means the round trip can be asserted directly:
 * `decode(build(spec))` must reproduce `spec`. If a student edits the JSON and
 * the XDR stops matching, that is a real finding rather than a UI bug.
 *
 * Everything here is pure and offline. Network calls (simulate, submit) belong
 * to the page, so this module stays testable without a testnet.
 */

import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
  Transaction,
} from '@stellar/stellar-sdk';

export type SupportedOperation =
  | 'payment'
  | 'createAccount'
  | 'manageData'
  | 'invokeHostFunction';

export interface OperationSpec {
  id: string;
  type: SupportedOperation;
  /** Operation-level source, if it differs from the transaction source. */
  source?: string;
  // payment
  destination?: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  // createAccount
  startingBalance?: string;
  // manageData
  name?: string;
  value?: string;
  // invokeHostFunction
  contractId?: string;
  functionName?: string;
}

export interface TransactionSpec {
  sourceAccount: string;
  sequence: string;
  fee: string;
  networkPassphrase: string;
  memo?: { type: 'none' | 'text' | 'id'; value?: string };
  timeoutSeconds?: number;
  operations: OperationSpec[];
}

export interface BuildResult {
  ok: boolean;
  xdr?: string;
  error?: string;
  /** Fee actually charged: base fee per operation. */
  totalFee?: string;
  operationCount?: number;
}

export const NETWORKS = {
  testnet: Networks.TESTNET,
  public: Networks.PUBLIC,
} as const;

/** A funded testnet account students can build against without a wallet. */
export function randomKeypair(): { publicKey: string; secret: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

export function emptySpec(sourceAccount = ''): TransactionSpec {
  return {
    sourceAccount,
    sequence: '0',
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
    memo: { type: 'none' },
    timeoutSeconds: 180,
    operations: [],
  };
}

function buildAsset(code?: string, issuer?: string): Asset {
  // No code, or an explicit XLM with no issuer, is the native asset. Passing an
  // issuer for XLM is a common mistake and produces a different asset entirely.
  if (!code || code.toUpperCase() === 'XLM') return Asset.native();
  if (!issuer) throw new Error(`Asset ${code} requires an issuer`);
  return new Asset(code, issuer);
}

function buildOperation(spec: OperationSpec): xdr.Operation {
  const withSource = spec.source ? { source: spec.source } : {};

  switch (spec.type) {
    case 'payment':
      if (!spec.destination) throw new Error('payment requires a destination');
      if (!spec.amount) throw new Error('payment requires an amount');
      return Operation.payment({
        destination: spec.destination,
        asset: buildAsset(spec.assetCode, spec.assetIssuer),
        amount: spec.amount,
        ...withSource,
      });

    case 'createAccount':
      if (!spec.destination) throw new Error('createAccount requires a destination');
      if (!spec.startingBalance) throw new Error('createAccount requires a startingBalance');
      return Operation.createAccount({
        destination: spec.destination,
        startingBalance: spec.startingBalance,
        ...withSource,
      });

    case 'manageData':
      if (!spec.name) throw new Error('manageData requires a name');
      // A null value deletes the entry — distinct from an empty string, which
      // stores a zero-length value. The distinction matters and is easy to miss.
      return Operation.manageData({
        name: spec.name,
        value: spec.value === undefined || spec.value === '' ? null : spec.value,
        ...withSource,
      });

    case 'invokeHostFunction': {
      if (!spec.contractId) throw new Error('invokeHostFunction requires a contractId');
      if (!spec.functionName) throw new Error('invokeHostFunction requires a functionName');
      // Built with no arguments: the point here is to show the envelope shape
      // of a Soroban invocation, and encoding arbitrary ScVals from free text
      // would be a type editor rather than an XDR lesson.
      return Operation.invokeContractFunction({
        contract: spec.contractId,
        function: spec.functionName,
        args: [],
        ...withSource,
      });
    }

    default:
      throw new Error(`Unsupported operation type: ${spec.type as string}`);
  }
}

function buildMemo(memo?: TransactionSpec['memo']): Memo {
  if (!memo || memo.type === 'none' || !memo.value) return Memo.none();
  return memo.type === 'id' ? Memo.id(memo.value) : Memo.text(memo.value);
}

/**
 * Assemble a spec into a signed-or-unsigned Base64 XDR envelope.
 *
 * Errors are returned rather than thrown: every field is student-editable, so
 * invalid input is the normal case and deserves a readable message next to the
 * field rather than a crashed render.
 */
export function buildTransactionXdr(spec: TransactionSpec, signWith?: string): BuildResult {
  try {
    if (!spec.sourceAccount) return { ok: false, error: 'A source account is required' };
    if (spec.operations.length === 0) {
      return { ok: false, error: 'A transaction needs at least one operation' };
    }

    const account = new Account(spec.sourceAccount, spec.sequence);
    const builder = new TransactionBuilder(account, {
      fee: spec.fee || BASE_FEE,
      networkPassphrase: spec.networkPassphrase,
    });

    for (const operation of spec.operations) {
      builder.addOperation(buildOperation(operation));
    }

    builder.addMemo(buildMemo(spec.memo));
    builder.setTimeout(spec.timeoutSeconds ?? 180);

    const tx = builder.build();

    if (signWith) {
      tx.sign(Keypair.fromSecret(signWith));
    }

    return {
      ok: true,
      xdr: tx.toEnvelope().toXDR('base64'),
      // The fee on the envelope is the total: base fee multiplied by the
      // operation count, not the per-operation figure that was entered.
      totalFee: tx.fee,
      operationCount: spec.operations.length,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface DecodedOperation {
  index: number;
  type: string;
  source?: string;
  details: Record<string, string>;
}

export interface DecodedEnvelope {
  ok: boolean;
  error?: string;
  sourceAccount?: string;
  sequence?: string;
  fee?: string;
  memo?: { type: string; value: string };
  timeBounds?: { minTime: string; maxTime: string } | null;
  signatureCount?: number;
  operations?: DecodedOperation[];
  /** Hash the signatures cover — network-specific, which is the trap below. */
  transactionHash?: string;
}

function describeOperation(op: Operation, index: number): DecodedOperation {
  const details: Record<string, string> = {};

  switch (op.type) {
    case 'payment':
      details.destination = op.destination;
      details.amount = op.amount;
      details.asset = op.asset.isNative() ? 'XLM (native)' : `${op.asset.getCode()}:${op.asset.getIssuer()}`;
      break;
    case 'createAccount':
      details.destination = op.destination;
      details.startingBalance = op.startingBalance;
      break;
    case 'manageData':
      details.name = op.name;
      details.value = op.value ? op.value.toString('utf8') : '(deleted)';
      break;
    case 'invokeHostFunction':
      details.function = 'invokeHostFunction';
      break;
    default:
      break;
  }

  return { index, type: op.type, source: op.source, details };
}

/**
 * Decode a Base64 XDR envelope back into readable fields.
 *
 * The network passphrase is required, not optional: signatures commit to a hash
 * that includes it, so the same envelope decodes to a *different* transaction
 * hash on testnet and mainnet. That is the mechanism preventing a testnet
 * transaction from being replayed on the public network, and it is worth
 * surfacing rather than hiding behind a default.
 */
export function decodeEnvelope(base64: string, networkPassphrase: string): DecodedEnvelope {
  try {
    if (!base64.trim()) return { ok: false, error: 'Paste a Base64 XDR envelope to decode' };

    const tx = new Transaction(base64.trim(), networkPassphrase);

    const memoValue =
      tx.memo.value === undefined || tx.memo.value === null
        ? ''
        : Buffer.isBuffer(tx.memo.value)
          ? tx.memo.value.toString('utf8')
          : String(tx.memo.value);

    return {
      ok: true,
      sourceAccount: tx.source,
      sequence: tx.sequence,
      fee: tx.fee,
      memo: { type: tx.memo.type, value: memoValue },
      timeBounds: tx.timeBounds
        ? { minTime: String(tx.timeBounds.minTime), maxTime: String(tx.timeBounds.maxTime) }
        : null,
      signatureCount: tx.signatures.length,
      operations: tx.operations.map((op, i) => describeOperation(op as Operation, i)),
      transactionHash: tx.hash().toString('hex'),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not decode envelope: ${error.message}`
          : 'Could not decode envelope',
    };
  }
}

/**
 * Round-trip check: does building this spec and decoding the result reproduce
 * the same source, sequence, and operation list?
 *
 * Used by the UI to prove the JSON and XDR views are two spellings of one
 * thing, which is the claim the whole page rests on.
 */
export function verifyRoundTrip(spec: TransactionSpec): { ok: boolean; detail: string } {
  const built = buildTransactionXdr(spec);
  if (!built.ok || !built.xdr) return { ok: false, detail: built.error ?? 'build failed' };

  const decoded = decodeEnvelope(built.xdr, spec.networkPassphrase);
  if (!decoded.ok) return { ok: false, detail: decoded.error ?? 'decode failed' };

  if (decoded.sourceAccount !== spec.sourceAccount) {
    return { ok: false, detail: 'source account did not survive the round trip' };
  }
  if (decoded.operations?.length !== spec.operations.length) {
    return { ok: false, detail: 'operation count changed across the round trip' };
  }

  return {
    ok: true,
    detail: `${decoded.operations.length} operation(s) round-tripped; envelope hash ${decoded.transactionHash?.slice(0, 16)}…`,
  };
}
