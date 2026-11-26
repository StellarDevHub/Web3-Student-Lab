import { jest } from '@jest/globals';
import {
  calculateSlippageBps,
  clearInMemoryReconciliationAlerts,
  exportReconciliationReportCsv,
  exportReconciliationReportJson,
  generateDailyReconciliationReport,
  getReconciliationAlerts,
  isSupportedCurrency,
  reconcilePayment,
  resolveReconciliationAlert,
  runReconciliationCycle,
  type LedgerClient,
  type OnChainSettlement,
  type ReconcilablePayment,
  type ReconciliationAlertRecord,
} from '../workers/paymentReconciliationWorker.js';

function createMockLedgerClient(
  settlements: Record<string, OnChainSettlement | null>
): LedgerClient {
  return {
    getFinalizedSettlement: jest.fn(async (txHash: string) => settlements[txHash] ?? null),
  };
}

describe('paymentReconciliationWorker (BE-092)', () => {
  beforeEach(() => {
    clearInMemoryReconciliationAlerts();
  });

  it('validates supported multi-currency Stellar tokens', () => {
    expect(isSupportedCurrency('XLM')).toBe(true);
    expect(isSupportedCurrency('USDC')).toBe(true);
    expect(isSupportedCurrency('EURC')).toBe(true);
    expect(isSupportedCurrency('usdc')).toBe(true);
    expect(isSupportedCurrency('DOGE')).toBe(false);
  });

  it('calculates slippage in basis points accurately', () => {
    expect(calculateSlippageBps(100, 100)).toBe(0);
    expect(calculateSlippageBps(100, 99.5)).toBe(50);
    expect(calculateSlippageBps(100, 90)).toBe(1000);
    expect(calculateSlippageBps(100, 100.25)).toBe(-25);
  });

  it('reconciles exact and within-tolerance multi-currency payments (XLM, USDC, EURC)', async () => {
    const ledgerClient = createMockLedgerClient({
      'tx-xlm': {
        txHash: 'tx-xlm',
        successful: true,
        ledgerSequence: 50001,
        closedAt: '2026-11-24T12:00:00Z',
        currency: 'XLM',
        settledAmount: 100,
      },
      'tx-usdc': {
        txHash: 'tx-usdc',
        successful: true,
        ledgerSequence: 50002,
        closedAt: '2026-11-24T12:01:00Z',
        currency: 'USDC',
        settledAmount: 49.8, // 40 bps slippage (within 50 bps tolerance)
      },
      'tx-eurc': {
        txHash: 'tx-eurc',
        successful: true,
        ledgerSequence: 50003,
        closedAt: '2026-11-24T12:02:00Z',
        currency: 'EURC',
        settledAmount: 25,
      },
    });

    const payments: ReconcilablePayment[] = [
      {
        id: 'pay-1',
        subscriptionId: 'sub-1',
        currency: 'XLM',
        expectedAmount: 100,
        txHash: 'tx-xlm',
        paidAt: new Date('2026-11-24T12:00:00Z'),
      },
      {
        id: 'pay-2',
        subscriptionId: 'sub-2',
        currency: 'USDC',
        expectedAmount: 50,
        txHash: 'tx-usdc',
        paidAt: new Date('2026-11-24T12:01:00Z'),
      },
      {
        id: 'pay-3',
        subscriptionId: 'sub-3',
        currency: 'EURC',
        expectedAmount: 25,
        txHash: 'tx-eurc',
        paidAt: new Date('2026-11-24T12:02:00Z'),
      },
    ];

    const persisted: string[] = [];
    const results = await runReconciliationCycle({
      ledgerClient,
      slippageToleranceBps: 50,
      loadPendingPayments: () => payments,
      persistResult: (r) => {
        persisted.push(`${r.paymentId}:${r.status}`);
      },
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'reconciled')).toBe(true);
    expect(results[1]?.slippageBps).toBe(40);
    expect(persisted).toEqual(['pay-1:reconciled', 'pay-2:reconciled', 'pay-3:reconciled']);
    expect(getReconciliationAlerts()).toHaveLength(0);
  });

  it('triggers slippage_exceeded alert when slippage breaches tolerance', async () => {
    const ledgerClient = createMockLedgerClient({
      'tx-slip': {
        txHash: 'tx-slip',
        successful: true,
        ledgerSequence: 50010,
        closedAt: '2026-11-24T13:00:00Z',
        currency: 'USDC',
        settledAmount: 98, // 200 bps slippage > 50 bps tolerance
      },
    });

    const alertsReceived: ReconciliationAlertRecord[] = [];
    const result = await reconcilePayment(
      {
        id: 'pay-slip',
        subscriptionId: 'sub-1',
        currency: 'USDC',
        expectedAmount: 100,
        txHash: 'tx-slip',
        paidAt: new Date('2026-11-24T13:00:00Z'),
      },
      {
        ledgerClient,
        slippageToleranceBps: 50,
        partialPaymentThresholdBps: 500,
        onAlert: (a) => {
          alertsReceived.push(a);
        },
      }
    );

    expect(result.status).toBe('slippage_exceeded');
    expect(result.slippageBps).toBe(200);
    expect(result.alert?.alertType).toBe('slippage_exceeded');
    expect(alertsReceived).toHaveLength(1);
    expect(getReconciliationAlerts()).toHaveLength(1);
  });

  it('triggers partial_payment alert when underpayment exceeds partial threshold', async () => {
    const ledgerClient = createMockLedgerClient({
      'tx-partial': {
        txHash: 'tx-partial',
        successful: true,
        ledgerSequence: 50011,
        closedAt: '2026-11-24T13:05:00Z',
        currency: 'EURC',
        settledAmount: 60, // 40% underpaid (4000 bps)
      },
    });

    const result = await reconcilePayment(
      {
        id: 'pay-partial',
        subscriptionId: 'sub-2',
        currency: 'EURC',
        expectedAmount: 100,
        txHash: 'tx-partial',
        paidAt: new Date('2026-11-24T13:05:00Z'),
      },
      { ledgerClient, slippageToleranceBps: 50, partialPaymentThresholdBps: 500 }
    );

    expect(result.status).toBe('partial_payment');
    expect(result.alert?.alertType).toBe('partial_payment');
    expect(result.alert?.severity).toBe('critical');
  });

  it('flags missing on-chain transactions, failed transactions, and currency mismatches', async () => {
    const ledgerClient = createMockLedgerClient({
      'tx-failed': {
        txHash: 'tx-failed',
        successful: false,
        ledgerSequence: 50020,
        closedAt: '2026-11-24T14:00:00Z',
        currency: 'XLM',
        settledAmount: 0,
      },
      'tx-wrong-asset': {
        txHash: 'tx-wrong-asset',
        successful: true,
        ledgerSequence: 50021,
        closedAt: '2026-11-24T14:01:00Z',
        currency: 'XLM',
        settledAmount: 50,
      },
    });

    const missing = await reconcilePayment(
      {
        id: 'pay-missing',
        subscriptionId: 'sub-3',
        currency: 'USDC',
        expectedAmount: 50,
        txHash: 'tx-not-found',
        paidAt: new Date('2026-11-24T14:00:00Z'),
      },
      { ledgerClient }
    );
    expect(missing.status).toBe('unmatched');
    expect(missing.alert?.alertType).toBe('missing_on_chain');

    const failed = await reconcilePayment(
      {
        id: 'pay-failed',
        subscriptionId: 'sub-3',
        currency: 'XLM',
        expectedAmount: 50,
        txHash: 'tx-failed',
        paidAt: new Date('2026-11-24T14:00:00Z'),
      },
      { ledgerClient }
    );
    expect(failed.status).toBe('discrepancy');
    expect(failed.alert?.alertType).toBe('tx_failed');

    const mismatch = await reconcilePayment(
      {
        id: 'pay-mismatch',
        subscriptionId: 'sub-3',
        currency: 'USDC',
        expectedAmount: 50,
        txHash: 'tx-wrong-asset',
        paidAt: new Date('2026-11-24T14:01:00Z'),
      },
      { ledgerClient }
    );
    expect(mismatch.status).toBe('discrepancy');
    expect(mismatch.alert?.alertType).toBe('currency_mismatch');

    const activeAlerts = getReconciliationAlerts();
    expect(activeAlerts).toHaveLength(3);

    const resolved = resolveReconciliationAlert(activeAlerts[0]!.id, 'finance-auditor');
    expect(resolved?.resolved).toBe(true);
    expect(resolved?.resolvedBy).toBe('finance-auditor');
    expect(getReconciliationAlerts()).toHaveLength(2);
  });

  it('generates daily financial reconciliation reports in JSON and CSV formats', () => {
    const reportDate = new Date('2026-11-24T00:00:00.000Z');
    const payments: ReconcilablePayment[] = [
      {
        id: 'pay-a',
        subscriptionId: 'sub-a',
        currency: 'USDC',
        expectedAmount: 100,
        settledAmount: 99.8,
        slippageBps: 20,
        ledgerSequence: 60001,
        txHash: 'tx-a',
        paidAt: new Date('2026-11-24T10:00:00.000Z'),
        reconciliationStatus: 'reconciled',
        reconciledAt: new Date('2026-11-24T10:01:00.000Z'),
        alertTriggered: false,
      },
      {
        id: 'pay-b',
        subscriptionId: 'sub-b',
        currency: 'EURC',
        expectedAmount: 50,
        settledAmount: 40,
        slippageBps: 2000,
        ledgerSequence: 60002,
        txHash: 'tx-b',
        paidAt: new Date('2026-11-24T11:00:00.000Z'),
        reconciliationStatus: 'partial_payment',
        reconciledAt: null,
        alertTriggered: true,
        reviewNotes: 'Partial payment, flagged for review',
      },
      {
        id: 'pay-other-day',
        subscriptionId: 'sub-c',
        currency: 'XLM',
        expectedAmount: 200,
        settledAmount: 200,
        slippageBps: 0,
        ledgerSequence: 59000,
        txHash: 'tx-c',
        paidAt: new Date('2026-11-23T23:59:59.000Z'),
        reconciliationStatus: 'reconciled',
      },
    ];

    const report = generateDailyReconciliationReport(payments, reportDate);
    expect(report.reportDate).toBe('2026-11-24');
    expect(report.totalPayments).toBe(2);
    expect(report.reconciledCount).toBe(1);
    expect(report.flaggedCount).toBe(1);
    expect(report.discrepancyCount).toBe(1);
    expect(report.totalsByCurrency.USDC?.expected).toBe(100);
    expect(report.totalsByCurrency.USDC?.settled).toBe(99.8);
    expect(report.totalsByCurrency.EURC?.expected).toBe(50);
    expect(report.totalsByCurrency.EURC?.settled).toBe(40);
    expect(report.maxSlippageBps).toBe(2000);

    const json = exportReconciliationReportJson(report);
    expect(JSON.parse(json).reportDate).toBe('2026-11-24');

    const csv = exportReconciliationReportCsv(report);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('paymentId,subscriptionId,txHash,currency');
    expect(lines[1]).toContain('pay-a,sub-a,tx-a,USDC,100,99.8,20,60001,reconciled');
    expect(lines[2]).toContain('"Partial payment, flagged for review"');
  });
});
