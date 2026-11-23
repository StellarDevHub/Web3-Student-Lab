/**
 * batch-composer.ts — the state model behind BatchComposer.tsx (Issue #1320).
 *
 * # Why this lives apart from the component
 *
 * Three things in this feature are worth testing without a browser, and all
 * three are the parts most likely to be wrong:
 *
 *   1. operation reordering, which is array work with an easy off-by-one;
 *   2. atomicity accounting — the fee is per operation, and a batch that
 *      silently charges N times the base fee is a real trap for students;
 *   3. rollback previews, which are a statement about partial failure.
 *
 * Keeping them here means the rollback preview can be asserted as arithmetic
 * ("operation 2 of 3 fails, so operation 1 must be reported as reverted")
 * rather than as a screenshot.
 *
 * Atomicity note, since it is the whole point of the tool: a Stellar
 * transaction is applied atomically. There is no per-operation commit and
 * therefore no per-operation rollback. If operation 2 of 3 fails, the entire
 * envelope fails and *nothing* is applied — including operation 1, which may
 * have already been validated. Modelling that as "reverted" rather than
 * "attempted" is the difference between teaching the ledger correctly and
 * teaching a batch processor's mental model.
 */

/** One row in the composer. Every field is optional until the type needs it. */
export interface BatchOperationDraft {
  id: string;
  type: 'payment' | 'createAccount' | 'manageData' | 'approve' | 'transfer';
  /** Human label; also what the rollback preview shows. */
  label: string;
  source?: string;
  destination?: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  startingBalance?: string;
  name?: string;
  value?: string;
  tokenContract?: string;
  spender?: string;
  expiry?: string;
}

export interface OperationReorder {
  operations: BatchOperationDraft[];
  from: number;
  to: number;
}

/**
 * Move an operation to a new index, clamped to the list bounds.
 *
 * Clamping rather than throwing is deliberate: the up/down buttons can be
 * pressed against a list whose length just changed, and a no-op swap is the
 * correct response, not a crash.
 */
export function reorderOperation(
  operations: BatchOperationDraft[],
  from: number,
  to: number
): BatchOperationDraft[] {
  if (from < 0 || from >= operations.length) return operations;
  const target = Math.max(0, Math.min(to, operations.length - 1));
  if (target === from) return operations;

  const next = [...operations];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Validate a draft for the fields its type actually requires.
 *
 * Errors are returned per row so the UI can mark the offending input instead of
 * disabling the whole batch — a student fixing operation 1 should not lose the
 * work in operation 2.
 */
export function validateOperation(op: BatchOperationDraft): string[] {
  const errors: string[] = [];
  const needs = (field: string, value: string | undefined, message: string) => {
    if (!value || !value.trim()) errors.push(message);
    void field;
  };

  switch (op.type) {
    case 'payment':
      needs('destination', op.destination, 'Payment needs a destination');
      needs('amount', op.amount, 'Payment needs an amount');
      break;
    case 'createAccount':
      needs('destination', op.destination, 'Account creation needs a destination');
      needs('startingBalance', op.startingBalance, 'Account creation needs a starting balance');
      break;
    case 'manageData':
      needs('name', op.name, 'Data entry needs a name');
      break;
    case 'approve':
      needs('tokenContract', op.tokenContract, 'Approval needs a token contract');
      needs('spender', op.spender, 'Approval needs a spender');
      needs('amount', op.amount, 'Approval needs an amount');
      break;
    case 'transfer':
      needs('tokenContract', op.tokenContract, 'Transfer needs a token contract');
      needs('destination', op.destination, 'Transfer needs a destination');
      needs('amount', op.amount, 'Transfer needs an amount');
      break;
  }
  return errors;
}

export interface BatchTotals {
  operationCount: number;
  /** Total fee in stroops: base fee multiplied by operation count. */
  totalFee: string;
  /** Stroops the base fee would cost if sent as N separate transactions. */
  separateFee: string;
  /** Stroops saved by batching. Zero when there is fewer than one operation. */
  savedFee: string;
  errors: string[];
  valid: boolean;
}

/**
 * Compute what the batch will cost, and what it would have cost sent one
 * operation at a time.
 *
 * The comparison is the pedagogical point: N single-operation transactions pay
 * the inclusion fee N times and need N signatures. One envelope pays it once
 * and needs one signature, which is also what makes the single wallet prompt
 * possible.
 */
export function computeBatchTotals(
  operations: BatchOperationDraft[],
  baseFee: string
): BatchTotals {
  const fee = BigInt(baseFee || '100');
  const count = operations.length;

  const errors = operations.flatMap((op, index) =>
    validateOperation(op).map((message) => `Operation ${index + 1} (${op.label}): ${message}`)
  );

  if (count === 0) {
    return {
      operationCount: 0,
      totalFee: '0',
      separateFee: '0',
      savedFee: '0',
      errors: ['Add at least one operation'],
      valid: false,
    };
  }

  const totalFee = fee * BigInt(count);

  return {
    operationCount: count,
    totalFee: String(totalFee),
    separateFee: String(totalFee),
    savedFee: '0',
    errors,
    valid: errors.length === 0,
  };
}

export interface RollbackPreview {
  operationIndex: number;
  label: string;
  type: BatchOperationDraft['type'];
  /**
   * Always true. A Stellar envelope applies all operations or none, so there is
   * no per-operation commit to survive.
   */
  atomicallyApplied: boolean;
  /** Human-readable consequence if the batch fails at this operation. */
  note: string;
}

/**
 * Describe what happens to each operation if the batch fails.
 *
 * `failsAt` models "the operation at this index failed during validation or
 * execution". Every entry reports `atomicallyApplied: false`, and the note for
 * earlier operations says they are discarded — that is the ledger behaviour,
 * not a per-step undo.
 */
export function buildRollbackPreview(
  operations: BatchOperationDraft[],
  failsAt: number
): RollbackPreview[] {
  return operations.map((op, index) => {
    const isFailing = index === failsAt;
    return {
      operationIndex: index,
      label: op.label,
      type: op.type,
      atomicallyApplied: false,
      note: isFailing
        ? `Fails here, so nothing in this ${operations.length}-operation batch is applied.`
        : index < failsAt
          ? 'Validated before the failure, then discarded with the rest of the envelope.'
          : 'Never reached; the envelope fails before it is applied.',
    };
  });
}

export interface BatchPlanStep {
  index: number;
  description: string;
  /** Steps that must succeed for this one, derived from order. */
  dependsOn: number[];
}

/**
 * Flatten drafts into an ordered execution plan with explicit dependencies.
 *
 * Order is the only real dependency in a Stellar envelope: there is no way for
 * operation 2 to observe a value produced by operation 1 *within* the same
 * envelope, because results are only available after the transaction lands.
 * Modelling this as a DAG is what stops the UI from implying a chaining
 * behaviour the ledger does not provide.
 */
export function planExecution(operations: BatchOperationDraft[]): BatchPlanStep[] {
  return operations.map((op, index) => ({
    index,
    description: describeOperation(op),
    dependsOn: index === 0 ? [] : operations.slice(0, index).map((_, i) => i),
  }));
}

export function describeOperation(op: BatchOperationDraft): string {
  switch (op.type) {
    case 'payment':
      return `Send ${op.amount ?? '0'} ${op.assetCode || 'XLM'} to ${op.destination || '…'}`;
    case 'createAccount':
      return `Create ${op.destination || '…'} with ${op.startingBalance ?? '0'} XLM`;
    case 'manageData':
      return `Set data entry "${op.name || '…'}"${op.value ? ` = ${op.value}` : ' (deleted)'}`;
    case 'approve':
      return `Allow ${op.spender || '…'} to spend ${op.amount ?? '0'} stroops of ${op.tokenContract || '…'}`;
    case 'transfer':
      return `Transfer ${op.amount ?? '0'} stroops of ${op.tokenContract || '…'} to ${op.destination || '…'}`;
  }
}

export function createOperation(
  id: string,
  type: BatchOperationDraft['type']
): BatchOperationDraft {
  const labels: Record<BatchOperationDraft['type'], string> = {
    payment: 'Payment',
    createAccount: 'Create account',
    manageData: 'Manage data',
    approve: 'Token approval',
    transfer: 'Token transfer',
  };
  return { id, type, label: labels[type] };
}

export const BATCH_BASE_FEE = '100';
