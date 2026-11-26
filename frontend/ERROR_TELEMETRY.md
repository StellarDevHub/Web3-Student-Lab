# Error boundary telemetry (FE-099)

What happens when a React render error is thrown in the UI, and how to use it.

## What a student sees

A crash inside an `ErrorBoundary` replaces **only that component** with a recovery
panel (`ErrorFallback` `variant="recovery"`). It is an inline, non-modal
`alertdialog`, so navigation, the wallet controls and the rest of the page stay
usable. It offers:

- **Reset & Try Again**: remounts the component.
- **Send crash report**: a short form ("What were you doing when this broke?",
  500 characters). The panel says plainly whether the report reached Sentry or was
  only saved on the device (for example when no DSN is configured).
- The existing **Rescue session**, **Export state**, **Go back** and **Home** actions.

Route-level crashes (`app/**/error.tsx`) use the same panel through
`RouteErrorFallback`, so they report the same way.

## What is sent to Sentry

Every crash goes through `reportCrash` (`src/lib/telemetry/crashReporter.ts`):

| Where in the event              | What                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| exception                       | the error and its stack trace                                                                                                                |
| `contexts.react.componentStack` | React's component hierarchy (from `errorInfo`)                                                                                               |
| `contexts.recent_actions`       | the last 30 user actions, one text line each                                                                                                 |
| `contexts.state_snapshot`       | an **allowlisted** snapshot: route (path only), online, environment, app version, feature flags, network, signed-in yes/no, viewport, locale |
| `user.id`                       | the active wallet, **masked** (`GAAA…WXYZ`)                                                                                                  |
| tags                            | `error_boundary` (the boundary's `componentName`), `crash_id`                                                                                |
| breadcrumbs                     | Sentry's own click, navigation, console and fetch trail                                                                                      |

A student's crash report is sent as Sentry user feedback linked to that event.

## What is never sent

All of it passes through `src/lib/telemetry/redact.ts` first, and
`sentry.client.config.ts` applies the same rules in `beforeSend` and
`beforeBreadcrumb`, with `sendDefaultPii: false`:

- Stellar addresses (`G…`, `C…`, `M…`) are masked to first and last four characters.
- Stellar secret seeds are removed entirely.
- Emails, bearer tokens and JWTs are removed.
- URLs are reduced to a path; query strings and fragments are dropped.
- Keys named like `password`, `token`, `seed`, `mnemonic`, `email`, etc. are dropped.
- Clicks record which control was used, never what was typed into it. Password
  fields are never described.
- The state snapshot is an allowlist. Editor contents and user records are not in it.

The student's free-text comment is scrubbed the same way, and the form tells them
not to include passwords, secret keys or recovery phrases.

## Using it

```tsx
import { ErrorBoundary } from '@/components/ui';

<ErrorBoundary componentName="LessonEditor">
  <LessonEditor />
</ErrorBoundary>;
```

Give each boundary a distinct `componentName`: it becomes the `error_boundary` tag
in Sentry. Wrap the _smallest_ subtree you can afford to lose, so a failure takes
out a widget rather than a page.

Record an app-level action in the trail:

```ts
import { recordBreadcrumb } from '@/lib/telemetry/breadcrumbs';

recordBreadcrumb({ category: 'app', message: 'Compiled contract' });
```

Messages are redacted automatically. Do not put secrets in `data`; keys that look
sensitive are dropped, but the allowlist is the safer habit.

## Configuration

| Variable                                   | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` (or `SENTRY_DSN`) | Where events go. Without one Sentry is disabled and crash reports are saved locally only. |
| `NEXT_PUBLIC_SENTRY_RELEASE`               | Release name on events.                                                                   |

`src/instrumentation-client.ts` is what loads `sentry.client.config.ts` in the
browser. Before FE-099 nothing imported that config, so the client was never
initialised.

## Not covered

- Errors in the root layout itself (above every boundary) still need a
  `global-error.tsx`.
- The server and edge configs (`sentry.server.config.ts`, `sentry.edge.config.ts`)
  are still not loaded; that needs an `instrumentation.ts` `register()` hook.
- Errors thrown in event handlers or async code are not caught by React error
  boundaries; Sentry's global handlers capture those separately.
