/**
 * breadcrumbs.ts — a short trail of recent user actions, kept in memory so a
 * crash report can say what the student was doing when something broke (FE-099).
 *
 * Sentry has its own breadcrumb integration for clicks, navigation, console and
 * fetch, and that is what populates the Sentry event. This buffer exists for the
 * parts Sentry cannot give us: a snapshot attached to the crash context that
 * works even when Sentry is not configured, and a trail the recovery UI can
 * show or save with the student's own report.
 *
 * What is recorded is deliberately thin. Clicks log *which control* was used
 * (its tag, role and label), never what was typed into it; inputs are described
 * by type and label only, and a password field is never described at all. Every
 * message passes through `redactString`, and URLs are reduced to a path.
 */

import * as Sentry from '@sentry/nextjs';
import { redactDeep, redactString, redactUrl } from './redact';

export type BreadcrumbCategory = 'ui.click' | 'navigation' | 'network.status' | 'wallet' | 'app';

export interface Breadcrumb {
  timestamp: number;
  category: BreadcrumbCategory;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

/** How many recent actions to keep. Enough to reconstruct a flow, small enough to attach. */
export const MAX_BREADCRUMBS = 30;
const MAX_LABEL_LENGTH = 40;

let buffer: Breadcrumb[] = [];

function push(crumb: Breadcrumb): void {
  buffer.push(crumb);
  if (buffer.length > MAX_BREADCRUMBS) buffer.shift();
}

/** The recent actions, oldest first. A copy, so callers cannot mutate the buffer. */
export function getBreadcrumbs(): Breadcrumb[] {
  return buffer.map((b) => ({ ...b }));
}

export function clearBreadcrumbs(): void {
  buffer = [];
}

/**
 * Record an app-level action (for example "Wallet connected"). Also forwarded to
 * Sentry. Automatic click/navigation tracking is *not* forwarded, because
 * Sentry's own integration already reports those.
 */
export function recordBreadcrumb(
  crumb: Omit<Breadcrumb, 'timestamp' | 'level'> & { level?: Breadcrumb['level'] }
): void {
  const entry: Breadcrumb = {
    timestamp: Date.now(),
    level: crumb.level ?? 'info',
    category: crumb.category,
    message: redactString(crumb.message),
    data: crumb.data ? redactDeep(crumb.data) : undefined,
  };
  push(entry);
  try {
    Sentry.addBreadcrumb({
      category: entry.category,
      message: entry.message,
      level: entry.level,
      data: entry.data,
      timestamp: entry.timestamp / 1000,
    });
  } catch {
    // Telemetry must never throw into the app.
  }
}

const INTERACTIVE_SELECTOR =
  'button, a, summary, select, textarea, input, [role="button"], [role="tab"], [role="menuitem"], [data-breadcrumb]';

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_LABEL_LENGTH ? `${flat.slice(0, MAX_LABEL_LENGTH)}…` : flat;
}

/**
 * Describe a clicked element without capturing anything the user typed. Returns
 * `null` for elements that must not be described at all.
 */
export function describeElement(target: Element | null): string | null {
  const el = target?.closest?.(INTERACTIVE_SELECTOR) ?? null;
  if (!el) return null;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' && (el as HTMLInputElement).type === 'password') return null;

  const role = el.getAttribute('role');
  const explicit = el.getAttribute('data-breadcrumb') ?? el.getAttribute('aria-label');

  let label = explicit ?? '';
  if (!label) {
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // Describe the field, never its value.
      label =
        el.getAttribute('name') ??
        el.getAttribute('placeholder') ??
        el.getAttribute('id') ??
        (el as HTMLInputElement).type ??
        '';
    } else {
      label = el.textContent ?? '';
    }
  }

  const kind = role ?? (tag === 'a' ? 'link' : tag);
  // Redact before clipping: clipping first can cut an address short so that it no
  // longer matches the address pattern, leaving a partial address in the trail.
  const clipped = clip(redactString(label));
  return clipped ? `Clicked ${kind} "${clipped}"` : `Clicked ${kind}`;
}

let uninstall: (() => void) | null = null;

/**
 * Start recording clicks, navigation and connectivity changes. Idempotent: a
 * second call is a no-op and returns the same teardown, so it is safe to call
 * from both the app bootstrap and an error boundary.
 */
export function installBreadcrumbTracking(): () => void {
  if (uninstall) return uninstall;
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const onClick = (event: MouseEvent) => {
    const message = describeElement(event.target as Element | null);
    if (message) push({ timestamp: Date.now(), category: 'ui.click', level: 'info', message });
  };

  const navigate = (kind: string) => {
    push({
      timestamp: Date.now(),
      category: 'navigation',
      level: 'info',
      message: `${kind} ${redactUrl(window.location.href)}`,
    });
  };

  const onPopState = () => navigate('Navigated to');
  const onOnline = () =>
    push({
      timestamp: Date.now(),
      category: 'network.status',
      level: 'info',
      message: 'Back online',
    });
  const onOffline = () =>
    push({
      timestamp: Date.now(),
      category: 'network.status',
      level: 'warning',
      message: 'Went offline',
    });

  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;

  window.history.pushState = function patchedPushState(...args) {
    const result = originalPush.apply(this, args as Parameters<typeof originalPush>);
    navigate('Navigated to');
    return result;
  };
  window.history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplace.apply(this, args as Parameters<typeof originalReplace>);
    navigate('Replaced route with');
    return result;
  };

  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  uninstall = () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.history.pushState = originalPush;
    window.history.replaceState = originalReplace;
    uninstall = null;
  };
  return uninstall;
}
