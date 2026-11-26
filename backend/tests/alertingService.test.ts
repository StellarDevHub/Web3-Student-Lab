import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createDlqIncidentAlert, extractPayloadIds, sendDlqIncidentAlert } from '../src/services/alertingService.js';

const envKeys = [
  'DLQ_PAGERDUTY_WEBHOOK_URL',
  'PAGERDUTY_WEBHOOK_URL',
  'PAGERDUTY_EVENTS_URL',
  'PAGERDUTY_ROUTING_KEY',
  'DLQ_SLACK_WEBHOOK_URL',
  'SLACK_WEBHOOK_URL',
  'DLQ_ALERT_WEBHOOK_URL',
];

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('alertingService (BE-063)', () => {
  it('extracts payload IDs from nested event data', () => {
    expect(
      extractPayloadIds({
        deliveryId: 'del_1',
        event: { id: 'evt_1' },
        studentId: 'stu_1',
        traceId: 'trace_1',
      })
    ).toEqual(['del_1', 'evt_1', 'stu_1', 'trace_1']);
  });

  it('builds a structured incident with full stack traces and payload IDs', () => {
    const alert = createDlqIncidentAlert({
      kind: 'job-dead-lettered',
      queue: 'ipfs-pinning',
      message: 'Job pin#job_1 exhausted retries',
      details: {
        jobId: 'job_1',
        dlqId: 'dlq_1',
        jobName: 'pin',
        attemptsMade: 6,
        stacktrace: ['Error: timeout', '  at pin (/app/worker.ts:42:11)'],
        data: { deliveryId: 'del_1', event: { id: 'evt_1' } },
      },
    });

    expect(alert.payloadIds).toEqual(['job_1', 'dlq_1', 'del_1', 'evt_1']);
    expect(alert.stacktrace).toEqual(['Error: timeout', '  at pin (/app/worker.ts:42:11)']);
    expect(alert.severity).toBe('error');
  });

  it('sends PagerDuty and Slack alerts containing stack traces and payload IDs', async () => {
    process.env.PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';
    process.env.PAGERDUTY_ROUTING_KEY = 'routing-secret';
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/incident';

    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as any);

    const alert = createDlqIncidentAlert({
      kind: 'job-dead-lettered',
      queue: 'email-notifications',
      message: 'Job email#job_9 exhausted retries',
      details: {
        jobId: 'job_9',
        attemptsMade: 6,
        stacktrace: ['Error: SMTP unavailable', '  at send (/app/email.ts:12:9)'],
        data: { deliveryId: 'del_9' },
      },
    });

    const result = await sendDlqIncidentAlert(alert);

    expect(result.delivered).toEqual(['pagerduty', 'slack']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const pagerDutyPayload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as any)?.body));
    expect(pagerDutyPayload.routing_key).toBe('routing-secret');
    expect(pagerDutyPayload.payload.custom_details.payloadIds).toContain('del_9');
    expect(pagerDutyPayload.payload.custom_details.stacktrace).toEqual([
      'Error: SMTP unavailable',
      '  at send (/app/email.ts:12:9)',
    ]);

    const slackPayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as any)?.body));
    expect(slackPayload.text).toContain('del_9');
    expect(slackPayload.text).toContain('Error: SMTP unavailable');
  });
});
