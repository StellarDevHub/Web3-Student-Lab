export type BridgeStatus =
  | 'initiated'
  | 'pending_anchor'
  | 'on_chain'
  | 'completed'
  | 'failed'
  | 'refunded';

export type BridgeProtocol = 'sep6' | 'sep24' | 'compatible';

export interface BridgeEndpointConfig {
  id: string;
  label: string;
  protocol: BridgeProtocol;
  baseUrl: string;
  assetCode?: string;
  network?: string;
  authToken?: string;
  pollIntervalMs?: number;
}

export interface BridgeTransaction {
  id: string;
  sourceChain: string;
  targetChain: string;
  amount: string;
  asset: string;
  sender: string;
  recipient: string;
  status: BridgeStatus;
  timestamp: Date;
  sourceTxHash?: string;
  targetTxHash?: string;
  anchorId?: string;
  errorMessage?: string;
  refundTxHash?: string;
  estimatedCompletion?: Date;
  serviceName?: string;
  protocol?: BridgeProtocol;
  rawStatus?: string;
}

export interface BridgeStatusService {
  listTransactions(
    endpoints: BridgeEndpointConfig[],
    signal?: AbortSignal
  ): Promise<BridgeTransaction[]>;
  getTransactionStatus(
    endpoint: BridgeEndpointConfig,
    transactionId: string,
    signal?: AbortSignal
  ): Promise<BridgeTransaction>;
}
