/**
 * Client bootstrap (FE-099). Next.js runs this file in the browser before the app
 * hydrates.
 *
 * `sentry.client.config.ts` is not picked up on its own — nothing in the build
 * (`withSentryConfig`) loads it — so without this import the Sentry client was
 * never initialised and no crash ever reached it. Initialisation is a no-op when
 * no DSN is configured.
 */
import '../sentry.client.config';
import { installBreadcrumbTracking } from '@/lib/telemetry/breadcrumbs';

// Start the recent-actions trail as early as possible, so a crash shortly after
// load still has something to report.
installBreadcrumbTracking();
