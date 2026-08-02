import type { WebhookDestination } from './types.js';
import { enqueueWebhookDeliveries } from './index.js';
import logger from '../../utils/logger.js';

type OsctEventType =
  | 'opensource.pr_submitted'
  | 'opensource.pr_merged'
  | 'opensource.issue_resolved'
  | 'opensource.contribution_milestone';

interface OsctEventData {
  prId?: string;
  repoId?: string;
  repoName?: string;
  issueId?: string;
  milestoneId?: string;
  contributorId: string;
  contributorName?: string;
  url?: string;
  score?: number;
}

export async function emitOsctEvent(
  eventType: OsctEventType,
  data: OsctEventData,
  destinations: WebhookDestination[]
): Promise<Array<{ deliveryId: string; queue: string }>> {
  const event = {
    id: `osct_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: eventType,
    occurredAt: new Date().toISOString(),
    source: 'opensource-contribution-trainer',
    data: data as unknown as Record<string, unknown>,
  };

  try {
    const results = await enqueueWebhookDeliveries(event, destinations);
    logger.info('OSCT webhook event emitted', {
      eventType,
      deliveryCount: results.length,
    });
    return results;
  } catch (error) {
    logger.error('Failed to emit OSCT webhook event', {
      eventType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function emitOsctPrSubmitted(
  data: OsctEventData,
  destinations: WebhookDestination[]
): Promise<Array<{ deliveryId: string; queue: string }>> {
  return emitOsctEvent('opensource.pr_submitted', data, destinations);
}

export async function emitOsctPrMerged(
  data: OsctEventData,
  destinations: WebhookDestination[]
): Promise<Array<{ deliveryId: string; queue: string }>> {
  return emitOsctEvent('opensource.pr_merged', data, destinations);
}

export async function emitOsctIssueResolved(
  data: OsctEventData,
  destinations: WebhookDestination[]
): Promise<Array<{ deliveryId: string; queue: string }>> {
  return emitOsctEvent('opensource.issue_resolved', data, destinations);
}

export async function emitOsctContributionMilestone(
  data: OsctEventData,
  destinations: WebhookDestination[]
): Promise<Array<{ deliveryId: string; queue: string }>> {
  return emitOsctEvent('opensource.contribution_milestone', data, destinations);
}
