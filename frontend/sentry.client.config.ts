// @ts-ignore
import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from './src/lib/telemetry/redact';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || 'web3-student-lab-frontend@1.0.0',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Enable distributed tracing headers propagation from frontend to backend API services
  tracePropagationTargets: [
    'localhost',
    /^\/api/,
    /^https:\/\/.*\/api/,
  ],

  // Capture unhandled errors and console errors in client session
  attachStacktrace: true,
  debug: false,

  // Crash telemetry (FE-099). Sentry's own breadcrumb integration records the
  // trail of clicks, navigation, console and fetch calls that is attached to
  // every event, so keep a deeper trail than the default 100-per-event cap needs.
  maxBreadcrumbs: 50,

  // Never let Sentry attach IP address, cookies or user details on its own.
  // `beforeSend` / `beforeBreadcrumb` then strip addresses, secrets, emails and
  // URL query strings from anything that is sent; the only user field that
  // survives is the masked wallet id set in `reportCrash`.
  sendDefaultPii: false,
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});
