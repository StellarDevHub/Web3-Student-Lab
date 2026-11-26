import logger from '../utils/logger.js';

export type DlqIncidentKind = 'job-dead-lettered' | 'threshold-exceeded';
export type DlqIncidentSeverity = 'critical' | 'error';

export interface DlqIncidentAlert {
  kind: DlqIncidentKind;
  queue: string;
  message: string;
  severity: DlqIncidentSeverity;
  failedAt: string;
  jobId?: string;
  dlqId?: string;
  jobName?: string;
  attemptsMade?: number;
  traceId?: string;
  userId?: string;
  payloadIds: string[];
  stacktrace: string[];
  details: Record<string, unknown>;
}

export interface CreateDlqIncidentAlertInput {
  kind: DlqIncidentKind;
  queue: string;
  message: string;
  details?: Record<string, unknown>;
}

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
};

export function extractPayloadIds(
  data: Record<string, unknown> | undefined,
  extras: Array<string | undefined> = []
): string[] {
  const event = data?.event as Record<string, unknown> | undefined;
  const candidates = [
    ...extras,
    data?.payloadId,
    data?.deliveryId,
    data?.certificateId,
    data?.eventId,
    event?.id,
    data?.studentId,
    data?.userId,
    data?.traceId,
  ];

  return [...new Set(candidates.map(asString).filter((id): id is string => Boolean(id)))];
}

export function createDlqIncidentAlert(input: CreateDlqIncidentAlertInput): DlqIncidentAlert {
  const details = input.details ?? {};
  const recordData = (details.data ?? details.payload) as Record<string, unknown> | undefined;
  const stacktrace = asStringArray(details.stacktrace);
  const jobId = asString(details.jobId);
  const dlqId = asString(details.dlqId);
  const jobName = asString(details.jobName);
  const attemptsMade = asNumber(details.attemptsMade);
  const traceId = asString(details.traceId);
  const userId = asString(details.userId);
  const failedAt = asString(details.failedAt) ?? new Date().toISOString();
  const payloadIds = extractPayloadIds(recordData, [
    asString(details.payloadId),
    asString(details.deliveryId),
    asString(details.certificateId),
    jobId,
    dlqId,
    traceId,
  ]);

  return {
    kind: input.kind,
    queue: input.queue,
    message: input.message,
    severity: input.kind === 'job-dead-lettered' ? 'error' : 'critical',
    failedAt,
    ...(jobId ? { jobId } : {}),
    ...(dlqId ? { dlqId } : {}),
    ...(jobName ? { jobName } : {}),
    ...(attemptsMade !== undefined ? { attemptsMade } : {}),
    ...(traceId ? { traceId } : {}),
    ...(userId ? { userId } : {}),
    payloadIds,
    stacktrace,
    details,
  };
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function formatAlertText(alert: DlqIncidentAlert): string {
  const payloadIds = alert.payloadIds.length ? alert.payloadIds.join(', ') : 'none';
  const stack = alert.stacktrace.length ? alert.stacktrace.join('\n') : 'not available';
  return [
    `*${alert.severity.toUpperCase()} DLQ incident: ${alert.kind}*`,
    alert.message,
    `Queue: ${alert.queue}`,
    `Payload IDs: ${payloadIds}`,
    `Attempts: ${alert.attemptsMade ?? 'unknown'}`,
    `Failed at: ${alert.failedAt}`,
    'Stack trace:',
    stack,
  ].join('\n');
}

function buildSlackPayload(alert: DlqIncidentAlert): Record<string, unknown> {
  return {
    text: formatAlertText(alert),
    ...alert,
  };
}

function buildPagerDutyPayload(alert: DlqIncidentAlert): Record<string, unknown> {
  const routingKey =
    firstEnv(['PAGERDUTY_ROUTING_KEY', 'PAGERDUTY_INTEGRATION_KEY', 'DLQ_PAGERDUTY_ROUTING_KEY']) ?? '';

  if (!routingKey) {
    return { text: formatAlertText(alert), ...alert };
  }

  return {
    routing_key: routingKey,
    event_action: 'trigger',
    payload: {
      summary: alert.message,
      severity: alert.severity,
      source: alert.queue,
      timestamp: alert.failedAt,
      custom_details: alert,
    },
  };
}

interface AlertTarget {
  name: string;
  url: string;
  payload: Record<string, unknown>;
}

function resolveAlertTargets(alert: DlqIncidentAlert): AlertTarget[] {
  const targets: AlertTarget[] = [];
  const add = (name: string, url: string | undefined, payload: Record<string, unknown>): void => {
    if (!url || targets.some((target) => target.url === url)) return;
    targets.push({ name, url, payload });
  };

  add(
    'pagerduty',
    firstEnv(['DLQ_PAGERDUTY_WEBHOOK_URL', 'PAGERDUTY_WEBHOOK_URL', 'PAGERDUTY_EVENTS_URL']),
    buildPagerDutyPayload(alert)
  );
  add('slack', firstEnv(['DLQ_SLACK_WEBHOOK_URL', 'SLACK_WEBHOOK_URL']), buildSlackPayload(alert));
  add('generic', firstEnv(['DLQ_ALERT_WEBHOOK_URL']), { text: formatAlertText(alert), ...alert });

  return targets;
}

async function postWebhook(target: AlertTarget): Promise<boolean> {
  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(target.payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.warn('[DLQ][ALERT] Webhook responded with non-2xx', {
        target: target.name,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn('[DLQ][ALERT] Webhook delivery failed', {
      target: target.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendDlqIncidentAlert(alert: DlqIncidentAlert): Promise<{ delivered: string[] }> {
  logger.error(`[DLQ][INCIDENT] ${alert.message}`, {
    kind: alert.kind,
    queue: alert.queue,
    severity: alert.severity,
    jobId: alert.jobId,
    dlqId: alert.dlqId,
    jobName: alert.jobName,
    attemptsMade: alert.attemptsMade,
    traceId: alert.traceId,
    userId: alert.userId,
    payloadIds: alert.payloadIds,
    failedAt: alert.failedAt,
    stacktrace: alert.stacktrace,
  });

  const results = await Promise.all(
    resolveAlertTargets(alert).map(async (target) => ({
      name: target.name,
      delivered: await postWebhook(target),
    }))
  );

  return { delivered: results.filter((result) => result.delivered).map((result) => result.name) };
}
