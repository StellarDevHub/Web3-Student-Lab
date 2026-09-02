import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../src/services/webhooks/index.js', () => ({
  ...jest.requireActual('../src/services/webhooks/index.js'),
  enqueueWebhookDeliveries: jest.fn(),
}));

import {
  emitOsctEvent,
  emitOsctPrSubmitted,
  emitOsctPrMerged,
  emitOsctIssueResolved,
  emitOsctContributionMilestone,
} from '../src/services/webhooks/osct-emitter.js';
import { enqueueWebhookDeliveries } from '../src/services/webhooks/index.js';

describe('OSCT webhook emitter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits pr_submitted event with correct payload', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockResolvedValue([{ deliveryId: 'd1', queue: 'q1' }]);

    const destinations = [{ url: 'https://example.com/wh', secret: 's1' }];
    const result = await emitOsctPrSubmitted(
      {
        contributorId: 'user-1',
        prId: 'pr-42',
        repoId: 'repo-1',
        repoName: 'org/repo',
        url: 'https://github.com/org/repo/pull/42',
      },
      destinations
    );

    expect(result[0].deliveryId).toBe('d1');
    expect(enqueueWebhookDeliveries).toHaveBeenCalledTimes(1);
    const callArg = (enqueueWebhookDeliveries as jest.Mock).mock.calls[0][0];
    expect(callArg.type).toBe('opensource.pr_submitted');
    expect(callArg.source).toBe('opensource-contribution-trainer');
    expect(callArg.data.repoName).toBe('org/repo');
  });

  it('emits pr_merged event', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockResolvedValue([{ deliveryId: 'd2', queue: 'q1' }]);

    const destinations = [{ url: 'https://example.com/wh' }];
    await emitOsctPrMerged(
      {
        contributorId: 'user-2',
        prId: 'pr-43',
        repoName: 'org/repo2',
        score: 50,
      },
      destinations
    );

    expect((enqueueWebhookDeliveries as jest.Mock).mock.calls[0][0].type).toBe('opensource.pr_merged');
  });

  it('emits issue_resolved event', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockResolvedValue([{ deliveryId: 'd3', queue: 'q1' }]);

    const destinations = [{ url: 'https://example.com/wh' }];
    await emitOsctIssueResolved(
      {
        contributorId: 'user-3',
        issueId: 'issue-10',
        repoId: 'repo-3',
        repoName: 'org/repo3',
      },
      destinations
    );

    expect((enqueueWebhookDeliveries as jest.Mock).mock.calls[0][0].type).toBe('opensource.issue_resolved');
  });

  it('emits contribution_milestone event', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockResolvedValue([{ deliveryId: 'd4', queue: 'q1' }]);

    const destinations = [{ url: 'https://example.com/wh' }];
    await emitOsctContributionMilestone(
      {
        contributorId: 'user-4',
        milestoneId: 'ms-1',
        repoName: 'org/repo4',
        score: 100,
      },
      destinations
    );

    expect((enqueueWebhookDeliveries as jest.Mock).mock.calls[0][0].type).toBe('opensource.contribution_milestone');
  });

  it('rethrows when enqueueWebhookDeliveries fails', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockRejectedValue(new Error('queue down'));

    await expect(
      emitOsctPrSubmitted(
        { contributorId: 'user-5', prId: 'pr-44' },
        [{ url: 'https://example.com/wh' }]
      )
    ).rejects.toThrow('queue down');
  });

  it('generates unique event ids', async () => {
    (enqueueWebhookDeliveries as jest.Mock).mockResolvedValue([{ deliveryId: 'd1', queue: 'q1' }]);

    const destinations = [{ url: 'https://example.com/wh' }];
    const r1 = await emitOsctPrSubmitted({ contributorId: 'u1', prId: 'p1' }, destinations);
    const r2 = await emitOsctPrSubmitted({ contributorId: 'u1', prId: 'p1' }, destinations);

    expect(r1[0].deliveryId).not.toBe(r2[0].deliveryId);
  });
});
