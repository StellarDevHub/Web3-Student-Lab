import { Horizon } from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';

export const SUPPORTED_CURRENCIES = ['XLM', 'USDC', 'EURC'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type ReconciliationStatus =
  | 'pending'
  | 'reconciled'
  | 'partial_payment'
  | 'slippage_exceeded'
  | 'discrepancy'
  | 'flagged'
  | 'unmatched';

export type ReconciliationAlertType =
  | 'partial_payment'
  | 'slippage_exceeded'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'missing_on_chain'
  | 'tx_failed';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ReconcilablePayment {
  id: string;
  subscriptionId: string;
  currency: string;
  expectedAmount: number;
  txHash: string | null;
  merchant?: string;
  subscriber?: string;
  paidAt: Date;
  reconciliationStatus?: ReconciliationStatus;
  settledAmount?: number | null;
  slippageBps?: number | null;
  ledgerSequence?: number | bigint | null;
  reconciledAt?: Date | null;
  alertTriggered?: boolean;
  reviewNotes?: string | null;
}

export interface OnChainSettlement {
  txHash: string;
  successful: boolean;
  ledgerSequence: number;
  closedAt: string;
  currency: string;
  settledAmount: number;
  destination?: string;
  source?: string;
}

export interface LedgerClient {
  getFinalizedSettlement(txHash: string): Promise<OnChainSettlement | null>;
}

export interface ReconciliationAlertRecord {
  id: string;
  paymentRecordId: string;
  txHash: string | null;
  currency: string;
  alertType: ReconciliationAlertType;
  severity: AlertSeverity;
  expectedAmount: number;
  settledAmount: number | null;
  slippageBps: number | null;
  message: string;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

export interface PaymentReconciliationResult {
  paymentId: string;
  txHash: string | null;
  currency: string;
  expectedAmount: number;
  settledAmount: number | null;
  slippageBps: number | null;
  ledgerSequence: number | null;
  status: ReconciliationStatus;
  reconciledAt: Date | null;
  alert: ReconciliationAlertRecord | null;
  reviewNotes: string | null;
}

export interface ReconciliationOptions {
  slippageToleranceBps?: number;
  partialPaymentThresholdBps?: number;
  ledgerClient?: LedgerClient;
  onAlert?: (alert: ReconciliationAlertRecord) => Promise<void> | void;
  webhookUrl?: string;
}

export interface CurrencyTotals {
  expected: number;
  settled: number;
  count: number;
  reconciledCount: number;
  flaggedCount: number;
  averageSlippageBps: number;
}

export interface DailyReconciliationReport {
  reportDate: string;
  generatedAt: string;
  totalPayments: number;
  reconciledCount: number;
  flaggedCount: number;
  discrepancyCount: number;
  averageSlippageBps: number;
  maxSlippageBps: number;
  totalsByCurrency: Record<string, CurrencyTotals>;
  items: Array<{
    paymentId: string;
    subscriptionId: string;
    txHash: string | null;
    currency: string;
    expectedAmount: number;
    settledAmount: number | null;
    slippageBps: number | null;
    ledgerSequence: number | null;
    reconciliationStatus: ReconciliationStatus;
    alertTriggered: boolean;
    paidAt: string;
    reconciledAt: string | null;
    reviewNotes: string | null;
  }>;
}

const DEFAULT_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const DEFAULT_SLIPPAGE_TOLERANCE_BPS = Number(process.env.SLIPPAGE_TOLERANCE_BPS || 50); // 0.50%
const DEFAULT_PARTIAL_PAYMENT_THRESHOLD_BPS = Number(
  process.env.PARTIAL_PAYMENT_THRESHOLD_BPS || 500
); // 5.00%
const DEFAULT_POLL_INTERVAL_MS = Number(
  process.env.PAYMENT_RECONCILIATION_INTERVAL_MS || 60_000
);

// In-memory store for alerts created during reconciliation (works alongside Prisma persistence)
const inMemoryAlerts: ReconciliationAlertRecord[] = [];

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency.toUpperCase() as SupportedCurrency);
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/**
 * Calculates exchange/settlement slippage in basis points (1 bps = 0.01%).
 * Positive bps means the settled amount is lower than expected (underpayment/slippage loss).
 * Negative bps means the settled amount is higher than expected (overpayment/favorable slippage).
 */
export function calculateSlippageBps(expectedAmount: number, settledAmount: number): number {
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return 0;
  }
  const diff = expectedAmount - settledAmount;
  return Math.round((diff / expectedAmount) * 10_000);
}

/**
 * Horizon-backed LedgerClient that polls finalized Stellar transactions and
 * extracts the settled payment amount and asset code (XLM, USDC, EURC).
 */
export class HorizonLedgerClient implements LedgerClient {
  private readonly server: Horizon.Server;

  constructor(horizonUrl: string = DEFAULT_HORIZON_URL) {
    this.server = new Horizon.Server(horizonUrl);
  }

  async getFinalizedSettlement(txHash: string): Promise<OnChainSettlement | null> {
    try {
      const tx = (await this.server.transactions().transaction(txHash).call()) as any;
      if (!tx) {
        return null;
      }

      const ledgerSequence = Number(tx.ledger_attr ?? tx.ledger ?? 0);
      const closedAt = String(tx.created_at ?? new Date().toISOString());

      if (!tx.successful) {
        return {
          txHash,
          successful: false,
          ledgerSequence,
          closedAt,
          currency: 'UNKNOWN',
          settledAmount: 0,
        };
      }

      const opsPage = (await this.server.operations().forTransaction(txHash).call()) as any;
      const records: any[] = Array.isArray(opsPage?.records) ? opsPage.records : [];

      const paymentOp = records.find(
        (op) =>
          op.type === 'payment' ||
          op.type === 'path_payment_strict_receive' ||
          op.type === 'path_payment_strict_send'
      );

      if (!paymentOp) {
        return {
          txHash,
          successful: true,
          ledgerSequence,
          closedAt,
          currency: 'UNKNOWN',
          settledAmount: 0,
        };
      }

      const currency =
        paymentOp.asset_type === 'native'
          ? 'XLM'
          : normalizeCurrency(String(paymentOp.asset_code || 'UNKNOWN'));
      const settledAmount = Number.parseFloat(String(paymentOp.amount ?? '0'));

      return {
        txHash,
        successful: true,
        ledgerSequence,
        closedAt,
        currency,
        settledAmount: Number.isFinite(settledAmount) ? settledAmount : 0,
        destination: paymentOp.to,
        source: paymentOp.from,
      };
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      if (status === 404) {
        return null;
      }
      logger.warn('[paymentReconciliation] Horizon lookup failed', {
        txHash,
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}

function createAlert(params: {
  paymentRecordId: string;
  txHash: string | null;
  currency: string;
  alertType: ReconciliationAlertType;
  severity: AlertSeverity;
  expectedAmount: number;
  settledAmount: number | null;
  slippageBps: number | null;
  message: string;
}): ReconciliationAlertRecord {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    paymentRecordId: params.paymentRecordId,
    txHash: params.txHash,
    currency: params.currency,
    alertType: params.alertType,
    severity: params.severity,
    expectedAmount: params.expectedAmount,
    settledAmount: params.settledAmount,
    slippageBps: params.slippageBps,
    message: params.message,
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date(),
  };
}

export async function dispatchAccountingAlert(
  alert: ReconciliationAlertRecord,
  options?: Pick<ReconciliationOptions, 'onAlert' | 'webhookUrl'>
): Promise<void> {
  inMemoryAlerts.push(alert);

  logger.warn('[paymentReconciliation] Accounting alert triggered', {
    alertId: alert.id,
    paymentRecordId: alert.paymentRecordId,
    alertType: alert.alertType,
    severity: alert.severity,
    currency: alert.currency,
    expectedAmount: alert.expectedAmount,
    settledAmount: alert.settledAmount,
    slippageBps: alert.slippageBps,
    message: alert.message,
  });

  if (options?.onAlert) {
    await options.onAlert(alert);
  }

  const webhookUrl = options?.webhookUrl ?? process.env.ACCOUNTING_ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.reconciliation.alert',
          alert,
        }),
      });
    } catch (err: any) {
      logger.error('[paymentReconciliation] Failed to deliver accounting alert webhook', {
        alertId: alert.id,
        error: err?.message || String(err),
      });
    }
  }
}

/**
 * Reconciles a single payment record against its finalized on-chain Stellar ledger settlement.
 */
export async function reconcilePayment(
  payment: ReconcilablePayment,
  options: ReconciliationOptions = {}
): Promise<PaymentReconciliationResult> {
  const slippageToleranceBps =
    options.slippageToleranceBps ?? DEFAULT_SLIPPAGE_TOLERANCE_BPS;
  const partialPaymentThresholdBps =
    options.partialPaymentThresholdBps ?? DEFAULT_PARTIAL_PAYMENT_THRESHOLD_BPS;
  const ledgerClient = options.ledgerClient ?? new HorizonLedgerClient();
  const expectedCurrency = normalizeCurrency(payment.currency || 'XLM');
  const expectedAmount = payment.expectedAmount;

  // Missing transaction hash -> cannot verify on-chain
  if (!payment.txHash) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: null,
      currency: expectedCurrency,
      alertType: 'missing_on_chain',
      severity: 'high',
      expectedAmount,
      settledAmount: null,
      slippageBps: null,
      message: `Payment ${payment.id} has no on-chain transaction hash; flagged for admin review.`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: null,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: null,
      slippageBps: null,
      ledgerSequence: null,
      status: 'flagged',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  const settlement = await ledgerClient.getFinalizedSettlement(payment.txHash);

  // Transaction not found on-chain
  if (!settlement) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      alertType: 'missing_on_chain',
      severity: 'high',
      expectedAmount,
      settledAmount: null,
      slippageBps: null,
      message: `Transaction ${payment.txHash} for payment ${payment.id} was not found on the finalized Stellar ledger.`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: null,
      slippageBps: null,
      ledgerSequence: null,
      status: 'unmatched',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  // Transaction failed on-chain
  if (!settlement.successful) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      alertType: 'tx_failed',
      severity: 'critical',
      expectedAmount,
      settledAmount: 0,
      slippageBps: 10_000,
      message: `On-chain transaction ${payment.txHash} failed at ledger ${settlement.ledgerSequence}.`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: 0,
      slippageBps: 10_000,
      ledgerSequence: settlement.ledgerSequence,
      status: 'discrepancy',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  const settledCurrency = normalizeCurrency(settlement.currency);
  if (settledCurrency !== expectedCurrency) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      alertType: 'currency_mismatch',
      severity: 'critical',
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps: null,
      message: `Currency mismatch for payment ${payment.id}: expected ${expectedCurrency}, settled ${settledCurrency} on ledger ${settlement.ledgerSequence}.`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps: null,
      ledgerSequence: settlement.ledgerSequence,
      status: 'discrepancy',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  const slippageBps = calculateSlippageBps(expectedAmount, settlement.settledAmount);

  // Partial payment (underpayment >= partialPaymentThresholdBps)
  if (slippageBps >= partialPaymentThresholdBps) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      alertType: 'partial_payment',
      severity: 'critical',
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps,
      message: `Partial payment detected for ${payment.id}: expected ${expectedAmount} ${expectedCurrency}, settled ${settlement.settledAmount} ${expectedCurrency} (slippage ${slippageBps} bps).`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps,
      ledgerSequence: settlement.ledgerSequence,
      status: 'partial_payment',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  // Exchange slippage exceeds allowed tolerance
  if (Math.abs(slippageBps) > slippageToleranceBps) {
    const alert = createAlert({
      paymentRecordId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      alertType: 'slippage_exceeded',
      severity: slippageBps > 0 ? 'high' : 'medium',
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps,
      message: `Slippage tolerance exceeded for ${payment.id}: expected ${expectedAmount} ${expectedCurrency}, settled ${settlement.settledAmount} ${expectedCurrency} (${slippageBps} bps vs tolerance ±${slippageToleranceBps} bps).`,
    });
    await dispatchAccountingAlert(alert, options);
    return {
      paymentId: payment.id,
      txHash: payment.txHash,
      currency: expectedCurrency,
      expectedAmount,
      settledAmount: settlement.settledAmount,
      slippageBps,
      ledgerSequence: settlement.ledgerSequence,
      status: 'slippage_exceeded',
      reconciledAt: null,
      alert,
      reviewNotes: alert.message,
    };
  }

  // Reconciled cleanly within tolerance
  return {
    paymentId: payment.id,
    txHash: payment.txHash,
    currency: expectedCurrency,
    expectedAmount,
    settledAmount: settlement.settledAmount,
    slippageBps,
    ledgerSequence: settlement.ledgerSequence,
    status: 'reconciled',
    reconciledAt: new Date(),
    alert: null,
    reviewNotes: null,
  };
}

/**
 * Reconciles a batch of payments and returns per-payment results.
 */
export async function reconcilePaymentsBatch(
  payments: ReconcilablePayment[],
  options: ReconciliationOptions = {}
): Promise<PaymentReconciliationResult[]> {
  const results: PaymentReconciliationResult[] = [];
  for (const payment of payments) {
    try {
      const result = await reconcilePayment(payment, options);
      results.push(result);
    } catch (err: any) {
      logger.error('[paymentReconciliation] Error reconciling payment', {
        paymentId: payment.id,
        error: err?.message || String(err),
      });
    }
  }
  return results;
}

/**
 * Generates a daily financial reconciliation report for a given UTC date (YYYY-MM-DD).
 */
export function generateDailyReconciliationReport(
  payments: ReconcilablePayment[],
  reportDate: Date = new Date()
): DailyReconciliationReport {
  const dateStr = reportDate.toISOString().slice(0, 10);

  const dayPayments = payments.filter((p) => {
    const paidDate = p.paidAt instanceof Date ? p.paidAt : new Date(p.paidAt);
    return paidDate.toISOString().slice(0, 10) === dateStr;
  });

  const totalsByCurrency: Record<string, CurrencyTotals> = {};
  const slippageByCurrency: Record<string, number[]> = {};
  const allSlippages: number[] = [];

  let reconciledCount = 0;
  let flaggedCount = 0;
  let discrepancyCount = 0;

  for (const p of dayPayments) {
    const currency = normalizeCurrency(p.currency || 'XLM');
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = {
        expected: 0,
        settled: 0,
        count: 0,
        reconciledCount: 0,
        flaggedCount: 0,
        averageSlippageBps: 0,
      };
      slippageByCurrency[currency] = [];
    }

    const bucket = totalsByCurrency[currency];
    bucket.expected += p.expectedAmount;
    bucket.settled += p.settledAmount ?? 0;
    bucket.count += 1;

    const status = p.reconciliationStatus ?? 'pending';
    if (status === 'reconciled') {
      reconciledCount += 1;
      bucket.reconciledCount += 1;
    } else if (
      status === 'flagged' ||
      status === 'unmatched' ||
      status === 'partial_payment' ||
      status === 'slippage_exceeded' ||
      status === 'discrepancy'
    ) {
      flaggedCount += 1;
      bucket.flaggedCount += 1;
      if (
        status === 'partial_payment' ||
        status === 'slippage_exceeded' ||
        status === 'discrepancy'
      ) {
        discrepancyCount += 1;
      }
    }

    if (typeof p.slippageBps === 'number' && Number.isFinite(p.slippageBps)) {
      allSlippages.push(p.slippageBps);
      slippageByCurrency[currency].push(p.slippageBps);
    }
  }

  for (const [currency, values] of Object.entries(slippageByCurrency)) {
    if (values.length > 0 && totalsByCurrency[currency]) {
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      totalsByCurrency[currency].averageSlippageBps = Number(avg.toFixed(2));
    }
  }

  const averageSlippageBps =
    allSlippages.length > 0
      ? Number(
          (allSlippages.reduce((sum, v) => sum + v, 0) / allSlippages.length).toFixed(2)
        )
      : 0;
  const maxSlippageBps =
    allSlippages.length > 0
      ? Math.max(...allSlippages.map((v) => Math.abs(v)))
      : 0;

  return {
    reportDate: dateStr,
    generatedAt: new Date().toISOString(),
    totalPayments: dayPayments.length,
    reconciledCount,
    flaggedCount,
    discrepancyCount,
    averageSlippageBps,
    maxSlippageBps,
    totalsByCurrency,
    items: dayPayments.map((p) => ({
      paymentId: p.id,
      subscriptionId: p.subscriptionId,
      txHash: p.txHash,
      currency: normalizeCurrency(p.currency || 'XLM'),
      expectedAmount: p.expectedAmount,
      settledAmount: p.settledAmount ?? null,
      slippageBps: p.slippageBps ?? null,
      ledgerSequence: p.ledgerSequence != null ? Number(p.ledgerSequence) : null,
      reconciliationStatus: p.reconciliationStatus ?? 'pending',
      alertTriggered: Boolean(p.alertTriggered),
      paidAt: (p.paidAt instanceof Date ? p.paidAt : new Date(p.paidAt)).toISOString(),
      reconciledAt: p.reconciledAt
        ? (p.reconciledAt instanceof Date
            ? p.reconciledAt
            : new Date(p.reconciledAt)
          ).toISOString()
        : null,
      reviewNotes: p.reviewNotes ?? null,
    })),
  };
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports a DailyReconciliationReport to RFC 4180 CSV format for financial auditing.
 */
export function exportReconciliationReportCsv(report: DailyReconciliationReport): string {
  const headers = [
    'reportDate',
    'paymentId',
    'subscriptionId',
    'txHash',
    'currency',
    'expectedAmount',
    'settledAmount',
    'slippageBps',
    'ledgerSequence',
    'reconciliationStatus',
    'alertTriggered',
    'paidAt',
    'reconciledAt',
    'reviewNotes',
  ];

  const rows = report.items.map((item) =>
    [
      report.reportDate,
      item.paymentId,
      item.subscriptionId,
      item.txHash ?? '',
      item.currency,
      item.expectedAmount,
      item.settledAmount ?? '',
      item.slippageBps ?? '',
      item.ledgerSequence ?? '',
      item.reconciliationStatus,
      item.alertTriggered,
      item.paidAt,
      item.reconciledAt ?? '',
      item.reviewNotes ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exports a DailyReconciliationReport to formatted JSON for auditing.
 */
export function exportReconciliationReportJson(report: DailyReconciliationReport): string {
  return JSON.stringify(report, null, 2);
}

export function getReconciliationAlerts(includeResolved = false): ReconciliationAlertRecord[] {
  return includeResolved ? [...inMemoryAlerts] : inMemoryAlerts.filter((a) => !a.resolved);
}

export function resolveReconciliationAlert(
  alertId: string,
  resolvedBy = 'admin'
): ReconciliationAlertRecord | null {
  const alert = inMemoryAlerts.find((a) => a.id === alertId);
  if (!alert) {
    return null;
  }
  alert.resolved = true;
  alert.resolvedAt = new Date();
  alert.resolvedBy = resolvedBy;
  return alert;
}

export function clearInMemoryReconciliationAlerts(): void {
  inMemoryAlerts.length = 0;
}

// Background polling worker lifecycle
let pollTimer: NodeJS.Timeout | null = null;
let isPolling = false;

export interface ReconciliationWorkerConfig extends ReconciliationOptions {
  intervalMs?: number;
  loadPendingPayments: () => Promise<ReconcilablePayment[]> | ReconcilablePayment[];
  persistResult: (result: PaymentReconciliationResult) => Promise<void> | void;
}

export async function runReconciliationCycle(
  config: ReconciliationWorkerConfig
): Promise<PaymentReconciliationResult[]> {
  const pending = await config.loadPendingPayments();
  if (pending.length === 0) {
    return [];
  }

  const results = await reconcilePaymentsBatch(pending, config);
  for (const result of results) {
    await config.persistResult(result);
  }

  logger.info('[paymentReconciliation] Completed reconciliation cycle', {
    processed: results.length,
    reconciled: results.filter((r) => r.status === 'reconciled').length,
    flagged: results.filter((r) => r.status !== 'reconciled').length,
  });

  return results;
}

export function startPaymentReconciliationWorker(config: ReconciliationWorkerConfig): void {
  if (pollTimer) {
    return;
  }

  const intervalMs = config.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  logger.info('[paymentReconciliation] Starting payment reconciliation worker', {
    intervalMs,
  });

  pollTimer = setInterval(async () => {
    if (isPolling) {
      return;
    }
    isPolling = true;
    try {
      await runReconciliationCycle(config);
    } catch (err: any) {
      logger.error('[paymentReconciliation] Worker cycle failed', {
        error: err?.message || String(err),
      });
    } finally {
      isPolling = false;
    }
  }, intervalMs);

  if (typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }
}

export function stopPaymentReconciliationWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('[paymentReconciliation] Stopped payment reconciliation worker');
  }
}
