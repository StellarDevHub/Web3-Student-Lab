export type WebhookEventName =
  | 'lab.completed'
  | 'contract.deployed'
  | 'certificate.minted'
  | 'onchain.event'
  // Blockchain Learning Simulator events
  | 'simulator.block_mined'
  | 'simulator.transaction_created'
  | 'simulator.chain_reset'
  // Open Source Contribution Trainer events
  | 'opensource.pr_submitted'
  | 'opensource.pr_merged'
  | 'opensource.issue_resolved'
  | 'opensource.contribution_milestone'
  | (string & {});

export interface WebhookEventPayload {
  id: string;
  type: WebhookEventName;
  occurredAt: string;
  source: string;
  data: Record<string, unknown>;
}

export interface WebhookDestination {
  id?: string;
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface WebhookDeliveryRequest {
  destination: WebhookDestination;
  event: WebhookEventPayload;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface WebhookDeliveryJobData extends WebhookDeliveryRequest {
  deliveryId: string;
  /**
   * traceId from the HTTP request that triggered this job (Issue #981).
   * Workers call logWithTraceId(traceId, …) so job logs are correlated
   * with the originating request.
   */
  traceId?: string;
}

export interface DeadLetterWebhookJob extends WebhookDeliveryJobData {
  failedAt: string;
  error: string;
  statusCode?: number;
}

export interface SignedWebhookHeaders {
  'content-type': 'application/json';
  'x-webhook-delivery-id': string;
  'x-webhook-event': string;
  'x-webhook-signature': string;
  'x-webhook-timestamp': string;
}

export type WebhookDeliveryState = 'pending' | 'delivered' | 'failed' | 'dead-letted';

export interface WebhookDeliveryHistoryEntry {
  idempotencyKey: string;
  state: WebhookDeliveryState;
  deliveryId: string;
  destinationUrl: string;
  eventId: string;
  eventType: WebhookEventName;
  updatedAt: string;
  attemptsMade?: number;
  error?: string;
}

