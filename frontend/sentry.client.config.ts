// @ts-ignore
import * as Sentry from '@sentry/nextjs';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from './src/utils/sentryScrubber';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release:
    process.env.NEXT_PUBLIC_SENTRY_RELEASE || 'web3-student-lab-frontend@1.0.0',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  tracePropagationTargets: ['localhost', /^\/api/, /^https:\/\/.*\/api/],

  beforeSend(event) {
    return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
  },

  beforeBreadcrumb(breadcrumb) {
    return scrubSentryBreadcrumb(
      breadcrumb as unknown as Record<string, unknown>
    ) as unknown as typeof breadcrumb;
  },

  attachStacktrace: true,
  debug: false,
});
