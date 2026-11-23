import { describe, expect, it } from 'vitest';
import {
  buildRollbackPreview,
  computeBatchTotals,
  createOperation,
  planExecution,
  reorderOperation,
  validateOperation,
  type BatchOperationDraft,
} from '../batch-composer';

const payment = (over: Partial<BatchOperationDraft> = {}): BatchOperationDraft => ({
  ...createOperation('op-1', 'payment'),
  destination: 'GDEST',
  amount: '10',
  ...over,
});

describe('reorderOperation', () => {
  const list = [
    createOperation('a', 'payment'),
    createOperation('b', 'approve'),
    createOperation('c', 'transfer'),
  ];

  it('moves an operation forward', () => {
    expect(reorderOperation(list, 0, 1).map((o) => o.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves an operation backward', () => {
    expect(reorderOperation(list, 2, 0).map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op at the boundaries rather than throwing', () => {
    expect(reorderOperation(list, 0, -1).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(reorderOperation(list, 2, 5).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const before = list.map((o) => o.id);
    reorderOperation(list, 0, 2);
    expect(list.map((o) => o.id)).toEqual(before);
  });
});

describe('validateOperation', () => {
  it('accepts a complete payment', () => {
    expect(validateOperation(payment())).toEqual([]);
  });

  it('reports every missing field for an empty approval', () => {
    const errors = validateOperation(createOperation('a', 'approve'));
    expect(errors).toHaveLength(3);
  });

  it('allows an empty manageData value, which deletes the entry', () => {
    expect(validateOperation(createOperation('m', 'manageData'))).toEqual([
      'Data entry needs a name',
    ]);
  });
});

describe('computeBatchTotals', () => {
  it('is invalid with no operations', () => {
    const totals = computeBatchTotals([], '100');
    expect(totals.valid).toBe(false);
    expect(totals.operationCount).toBe(0);
  });

  it('multiplies the base fee by the operation count', () => {
    const totals = computeBatchTotals(
      [payment(), payment({ id: 'op-2' }), payment({ id: 'op-3' })],
      '100'
    );
    expect(totals.totalFee).toBe('300');
    expect(totals.operationCount).toBe(3);
    expect(totals.valid).toBe(true);
  });

  it('prefixes errors with the operation position', () => {
    const totals = computeBatchTotals([payment(), payment({ id: 'op-2', amount: '' })], '100');
    expect(totals.valid).toBe(false);
    expect(totals.errors[0]).toMatch(/^Operation 2/);
  });
});

describe('buildRollbackPreview', () => {
  const batch = [
    payment({ id: 'op-1' }),
    createOperation('op-2', 'approve'),
    createOperation('op-3', 'transfer'),
  ];

  it('never marks any operation as applied', () => {
    const preview = buildRollbackPreview(batch, 1);
    expect(preview.every((entry) => entry.atomicallyApplied === false)).toBe(true);
  });

  it('explains that earlier operations are discarded, not rolled back', () => {
    const preview = buildRollbackPreview(batch, 1);
    expect(preview[0].note).toMatch(/discarded/i);
  });

  it('marks operations after the failure as never reached', () => {
    const preview = buildRollbackPreview(batch, 1);
    expect(preview[2].note).toMatch(/never reached/i);
  });

  it('names the failing operation and the batch size', () => {
    expect(buildRollbackPreview(batch, 0)[0].note).toMatch(/3-operation batch/);
  });

  it('returns an empty preview for an empty batch', () => {
    expect(buildRollbackPreview([], 0)).toEqual([]);
  });
});

describe('planExecution', () => {
  it('gives the first step no dependencies and later steps all earlier ones', () => {
    const plan = planExecution([
      payment({ id: 'op-1' }),
      createOperation('op-2', 'approve'),
      createOperation('op-3', 'transfer'),
    ]);
    expect(plan[0].dependsOn).toEqual([]);
    expect(plan[1].dependsOn).toEqual([0]);
    expect(plan[2].dependsOn).toEqual([0, 1]);
  });

  it('describes each step in student-readable terms', () => {
    const plan = planExecution([createOperation('a', 'transfer')]);
    expect(plan[0].description).toMatch(/Transfer/);
  });
});
