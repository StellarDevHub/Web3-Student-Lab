import type {
  BridgeEndpointConfig,
  BridgeProtocol,
  BridgeStatus,
  BridgeStatusService,
  BridgeTransaction,
} from './types';

type RawBridgeTransaction = Record<string, unknown>;

const DEFAULT_POLL_INTERVAL_MS = 15000;
const SUPPORTED_PROTOCOLS = new Set<BridgeProtocol>(['sep6', 'sep24', 'compatible']);
const VALID_TRANSACTION_ID = /^[A-Za-z0-9:_-]{3,128}$/;

const FAILED_STATUSES = new Set([
  'error',
  'expired',
  'no_market',
  'too_small',
  'too_large',
]);

const PENDING_ANCHOR_STATUSES = new Set([
  'pending_anchor',
  'pending_trust',
  'pending_user',
  'pending_user_transfer_start',
  'pending_user_transfer_complete',
  'pending_sender',
  'pending_receiver',
  'pending_transaction_info_update',
  'pending_customer_info_update',
]);

export class BridgeServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid_config'
      | 'invalid_transaction_id'
      | 'unsupported_network'
      | 'service_unavailable'
      | 'invalid_response'
  ) {
    super(message);
  }
}

export function getDefaultPollIntervalMs(endpoints: BridgeEndpointConfig[]): number {
  const configured = endpoints
    .map((endpoint) => endpoint.pollIntervalMs)
    .filter((value): value is number => typeof value === 'number' && value >= 5000);

  return configured.length > 0 ? Math.min(...configured) : DEFAULT_POLL_INTERVAL_MS;
}

export function parseBridgeEndpointConfig(raw = process.env.NEXT_PUBLIC_BRIDGE_ENDPOINTS || '') {
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as BridgeEndpointConfig[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEndpointConfig).filter(Boolean) as BridgeEndpointConfig[];
  } catch {
    return raw
      .split(';')
      .map((entry, index) => {
        const [protocol, baseUrl, assetCode, label] = entry.split('|').map((part) => part.trim());
        if (!protocol || !baseUrl) return null;
        return normalizeEndpointConfig({
          id: `bridge-${index + 1}`,
          label: label || baseUrl,
          protocol,
          baseUrl,
          assetCode,
        });
      })
      .filter(Boolean) as BridgeEndpointConfig[];
  }
}

function normalizeEndpointConfig(config: Partial<BridgeEndpointConfig>): BridgeEndpointConfig | null {
  if (!config.protocol || !SUPPORTED_PROTOCOLS.has(config.protocol as BridgeProtocol)) {
    return null;
  }

  if (!config.baseUrl) return null;

  return {
    id: config.id || `${config.protocol}:${config.baseUrl}`,
    label: config.label || config.baseUrl,
    protocol: config.protocol as BridgeProtocol,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    assetCode: config.assetCode,
    network: config.network,
    authToken: config.authToken,
    pollIntervalMs: config.pollIntervalMs,
  };
}

export function mapSepStatusToBridgeStatus(status: string | undefined): BridgeStatus {
  const normalized = status?.toLowerCase();

  if (!normalized || normalized === 'incomplete') return 'initiated';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'refunded') return 'refunded';
  if (normalized === 'pending_external' || normalized === 'pending_stellar') return 'on_chain';
  if (FAILED_STATUSES.has(normalized)) return 'failed';
  if (PENDING_ANCHOR_STATUSES.has(normalized)) return 'pending_anchor';

  return 'pending_anchor';
}

export function validateTransactionId(transactionId: string) {
  if (!VALID_TRANSACTION_ID.test(transactionId)) {
    throw new BridgeServiceError('Invalid bridge transaction identifier.', 'invalid_transaction_id');
  }
}

export function mapRawBridgeTransaction(
  raw: RawBridgeTransaction,
  endpoint: BridgeEndpointConfig
): BridgeTransaction {
  const id = stringValue(raw.id) || stringValue(raw.transaction_id) || stringValue(raw.memo);
  if (!id) {
    throw new BridgeServiceError('Bridge endpoint returned a transaction without an id.', 'invalid_response');
  }

  const kind = stringValue(raw.kind) || 'transfer';
  const rawStatus = stringValue(raw.status);
  const status = mapSepStatusToBridgeStatus(rawStatus);
  const sourceTxHash =
    stringValue(raw.stellar_transaction_id) ||
    stringValue(raw.stellarTransactionId) ||
    stringValue(raw.from_tx_hash);
  const targetTxHash =
    stringValue(raw.external_transaction_id) ||
    stringValue(raw.externalTransactionId) ||
    stringValue(raw.to_tx_hash);

  return {
    id,
    sourceChain: inferSourceChain(kind, endpoint),
    targetChain: inferTargetChain(kind, endpoint),
    amount:
      stringValue(raw.amount_in) ||
      stringValue(raw.amount_out) ||
      stringValue(raw.amount) ||
      'Unknown',
    asset:
      stringValue(raw.asset_code) ||
      stringValue(raw.assetCode) ||
      endpoint.assetCode ||
      'Asset',
    sender: stringValue(raw.from) || stringValue(raw.sender) || 'Unknown',
    recipient: stringValue(raw.to) || stringValue(raw.recipient) || 'Unknown',
    status,
    timestamp: dateValue(raw.started_at) || dateValue(raw.created_at) || new Date(),
    sourceTxHash,
    targetTxHash,
    anchorId: stringValue(raw.id),
    errorMessage:
      status === 'failed' || status === 'refunded' ? stringValue(raw.message) : undefined,
    refundTxHash: firstRefundHash(raw),
    estimatedCompletion: dateValue(raw.user_action_required_by),
    serviceName: endpoint.label,
    protocol: endpoint.protocol,
    rawStatus,
  };
}

export class HttpBridgeStatusService implements BridgeStatusService {
  async listTransactions(
    endpoints: BridgeEndpointConfig[],
    signal?: AbortSignal
  ): Promise<BridgeTransaction[]> {
    const transactions = await Promise.all(
      endpoints.map((endpoint) => this.fetchEndpointTransactions(endpoint, signal))
    );

    return transactions.flat().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getTransactionStatus(
    endpoint: BridgeEndpointConfig,
    transactionId: string,
    signal?: AbortSignal
  ): Promise<BridgeTransaction> {
    validateEndpoint(endpoint);
    validateTransactionId(transactionId);

    const url = buildEndpointUrl(endpoint.baseUrl, '/transaction');
    url.searchParams.set('id', transactionId);
    if (endpoint.assetCode) url.searchParams.set('asset_code', endpoint.assetCode);

    const payload = await fetchJson(url, endpoint, signal);
    const raw = extractSingleTransaction(payload);
    return mapRawBridgeTransaction(raw, endpoint);
  }

  private async fetchEndpointTransactions(
    endpoint: BridgeEndpointConfig,
    signal?: AbortSignal
  ): Promise<BridgeTransaction[]> {
    validateEndpoint(endpoint);

    const url = buildEndpointUrl(endpoint.baseUrl, '/transactions');
    if (endpoint.assetCode) url.searchParams.set('asset_code', endpoint.assetCode);

    const payload = await fetchJson(url, endpoint, signal);
    return extractTransactions(payload).map((transaction) =>
      mapRawBridgeTransaction(transaction, endpoint)
    );
  }
}

export const bridgeStatusService = new HttpBridgeStatusService();

function validateEndpoint(endpoint: BridgeEndpointConfig) {
  if (!SUPPORTED_PROTOCOLS.has(endpoint.protocol)) {
    throw new BridgeServiceError(`Unsupported bridge protocol: ${endpoint.protocol}`, 'invalid_config');
  }

  try {
    new URL(endpoint.baseUrl);
  } catch {
    throw new BridgeServiceError(`Invalid bridge endpoint URL: ${endpoint.baseUrl}`, 'invalid_config');
  }

  if (endpoint.network && endpoint.network.toLowerCase() === 'unsupported') {
    throw new BridgeServiceError('Configured bridge network is unsupported.', 'unsupported_network');
  }
}

function buildEndpointUrl(baseUrl: string, path: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base);
}

async function fetchJson(
  url: URL,
  endpoint: BridgeEndpointConfig,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    signal,
    headers: endpoint.authToken
      ? {
          Authorization: `Bearer ${endpoint.authToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new BridgeServiceError(
      `${endpoint.label} returned ${response.status} while fetching bridge status.`,
      'service_unavailable'
    );
  }

  return response.json();
}

function extractTransactions(payload: unknown): RawBridgeTransaction[] {
  if (Array.isArray(payload)) return payload as RawBridgeTransaction[];
  if (!payload || typeof payload !== 'object') {
    throw new BridgeServiceError('Bridge endpoint returned an invalid response.', 'invalid_response');
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.transactions, record.records, record.data];
  const transactions = candidates.find(Array.isArray);
  if (!transactions) return [];
  return transactions as RawBridgeTransaction[];
}

function extractSingleTransaction(payload: unknown): RawBridgeTransaction {
  if (!payload || typeof payload !== 'object') {
    throw new BridgeServiceError('Bridge endpoint returned an invalid transaction.', 'invalid_response');
  }

  const record = payload as Record<string, unknown>;
  const transaction = record.transaction || record.record || payload;
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
    throw new BridgeServiceError('Bridge endpoint returned an invalid transaction.', 'invalid_response');
  }

  return transaction as RawBridgeTransaction;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function dateValue(value: unknown): Date | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstRefundHash(raw: RawBridgeTransaction): string | undefined {
  const refunds = raw.refunds;
  if (!refunds || typeof refunds !== 'object') return undefined;
  const payments = (refunds as Record<string, unknown>).payments;
  if (!Array.isArray(payments)) return undefined;
  const first = payments[0];
  if (!first || typeof first !== 'object') return undefined;
  return stringValue((first as Record<string, unknown>).id);
}

function inferSourceChain(kind: string, endpoint: BridgeEndpointConfig): string {
  if (kind.includes('withdraw')) return 'Stellar';
  return endpoint.network || endpoint.label;
}

function inferTargetChain(kind: string, endpoint: BridgeEndpointConfig): string {
  if (kind.includes('withdraw')) return endpoint.network || endpoint.label;
  return 'Stellar';
}
