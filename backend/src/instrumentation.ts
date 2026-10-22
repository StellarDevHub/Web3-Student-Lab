/**
 * OpenTelemetry Instrumentation — Issue BE-013
 *
 * Boots `@opentelemetry/sdk-node` and exports the helpers used to propagate
 * W3C trace-context (`traceparent` / `tracestate`) across process boundaries:
 *
 *   - HTTP: `tracingMiddleware` extracts the inbound context and opens a
 *     SERVER span for every request.
 *   - BullMQ: producers attach `withTraceContext(data)` to job payloads and
 *     workers wrap their processor in `traceJob(...)`, so a job span is a child
 *     of the HTTP request that enqueued it.
 *   - Redis Pub/Sub: publishers embed `injectTraceContext()` in the message
 *     envelope and subscribers run handlers in `runInSpan(..., { parent })`.
 *
 * Spans are exported over OTLP/HTTP to Jaeger (Jaeger ≥1.35 ingests OTLP
 * natively on :4318). Configure with:
 *   OTEL_SERVICE_NAME              (default: web3-student-lab-backend)
 *   OTEL_EXPORTER_JAEGER_ENDPOINT  (default: http://localhost:4318/v1/traces)
 *   OTEL_TRACES_SAMPLER / _ARG     (standard OTel sampler env vars)
 *   OTEL_SDK_DISABLED=true         (turn tracing off entirely)
 *
 * When the SDK is not started the OpenTelemetry API is a no-op, so every
 * helper below is safe to call unconditionally.
 */

import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from '@opentelemetry/api';
import { queueJobDuration } from './metrics/prometheusExporter.js';
import logger from './utils/logger.js';

export const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'web3-student-lab-backend';

export const tracer = trace.getTracer(SERVICE_NAME);

/** Serialised W3C trace-context headers carried inside job / message payloads. */
export type TraceCarrier = Record<string, string>;

interface ShutdownableSdk {
  shutdown(): Promise<void>;
}

let sdk: ShutdownableSdk | null = null;
let starting: Promise<boolean> | null = null;

/**
 * Whether the OpenTelemetry SDK should own the global tracer provider. Sentry
 * reads this to skip its own OpenTelemetry setup so the two never compete.
 */
export function isTracingEnabled(): boolean {
  return process.env.OTEL_SDK_DISABLED !== 'true' && process.env.NODE_ENV !== 'test';
}

/**
 * Start the OpenTelemetry Node SDK. Idempotent; resolves to `true` once the
 * SDK is running and `false` when tracing is disabled or failed to load.
 */
export function startTracing(): Promise<boolean> {
  if (starting) return starting;

  starting = (async () => {
    if (!isTracingEnabled()) {
      return false;
    }

    try {
      const [{ NodeSDK }, { OTLPTraceExporter }, { resourceFromAttributes }, semconv] = await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@opentelemetry/resources'),
        import('@opentelemetry/semantic-conventions'),
      ]);

      const instance = new NodeSDK({
        resource: resourceFromAttributes({
          [semconv.ATTR_SERVICE_NAME]: SERVICE_NAME,
          [semconv.ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
          'deployment.environment.name': process.env.NODE_ENV || 'development',
        }),
        traceExporter: new OTLPTraceExporter({
          url:
            process.env.OTEL_EXPORTER_JAEGER_ENDPOINT ||
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
            'http://localhost:4318/v1/traces',
        }),
      });

      instance.start();
      sdk = instance;

      process.once('SIGTERM', () => {
        void shutdownTracing();
      });

      logger.info('OpenTelemetry tracing started', { service: SERVICE_NAME });
      return true;
    } catch (error) {
      logger.warn('OpenTelemetry tracing could not be started; continuing without it', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  })();

  return starting;
}

/** Flush pending spans and stop the SDK. */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) return;
  const instance = sdk;
  sdk = null;
  starting = null;
  try {
    await instance.shutdown();
  } catch (error) {
    logger.warn('OpenTelemetry shutdown failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Context propagation ─────────────────────────────────────────────────────

/** Serialise the given (default: active) context into W3C headers. */
export function injectTraceContext(ctx: Context = context.active()): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(ctx, carrier);
  return carrier;
}

/** Rebuild a context from W3C headers; falls back to the root context. */
export function extractTraceContext(carrier?: TraceCarrier | null): Context {
  if (!carrier) return ROOT_CONTEXT;
  return propagation.extract(ROOT_CONTEXT, carrier);
}

export interface RunInSpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
  /** Explicit parent context; defaults to the active context. */
  parent?: Context;
}

function failSpan(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : new Error(String(error)));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Run `fn` inside a new active span. Works for sync and async callbacks: the
 * span ends when the returned promise settles (or immediately for sync work)
 * and errors are recorded on the span before being re-thrown.
 */
export function runInSpan<T>(name: string, options: RunInSpanOptions, fn: (span: Span) => T): T {
  const parent = options.parent ?? context.active();
  const span = tracer.startSpan(
    name,
    { kind: options.kind ?? SpanKind.INTERNAL, attributes: options.attributes ?? {} },
    parent,
  );

  return context.with(trace.setSpan(parent, span), () => {
    let result: T;
    try {
      result = fn(span);
    } catch (error) {
      failSpan(span, error);
      span.end();
      throw error;
    }

    if (result instanceof Promise) {
      return result.then(
        (value) => {
          span.end();
          return value;
        },
        (error: unknown) => {
          failSpan(span, error);
          span.end();
          throw error;
        },
      ) as T;
    }

    span.end();
    return result;
  });
}

// ─── BullMQ ──────────────────────────────────────────────────────────────────

/** Job payload field that carries the producer's trace context. */
export const JOB_TRACE_FIELD = '_traceContext';

export type TracedJobData<T> = T & { [JOB_TRACE_FIELD]?: TraceCarrier };

/** Attach the active trace context to a BullMQ job payload. */
export function withTraceContext<T extends object>(data: T): TracedJobData<T> {
  return { ...data, [JOB_TRACE_FIELD]: injectTraceContext() };
}

/** Wrap a `queue.add(...)` call in a PRODUCER span and inject its context. */
export function traceEnqueue<T extends object, R>(
  queueName: string,
  data: T,
  add: (tracedData: TracedJobData<T>) => Promise<R>,
): Promise<R> {
  return runInSpan(
    `${queueName} publish`,
    {
      kind: SpanKind.PRODUCER,
      attributes: { 'messaging.system': 'bullmq', 'messaging.destination.name': queueName },
    },
    () => add(withTraceContext(data)),
  );
}

interface TraceableJob {
  id?: string | undefined;
  name: string;
  attemptsMade: number;
  data: unknown;
}

/**
 * Execute a BullMQ processor as a CONSUMER span whose parent is the context
 * the producer attached to the job, linking the job back to its HTTP request.
 */
export async function traceJob<R>(queueName: string, job: TraceableJob, processor: () => Promise<R>): Promise<R> {
  const carrier =
    job.data && typeof job.data === 'object'
      ? ((job.data as Record<string, unknown>)[JOB_TRACE_FIELD] as TraceCarrier | undefined)
      : undefined;

  const startedAt = process.hrtime.bigint();
  let outcome = 'completed';
  try {
    return await runInSpan(
      `${queueName} process`,
      {
        kind: SpanKind.CONSUMER,
        parent: extractTraceContext(carrier),
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': queueName,
          'messaging.operation.name': job.name,
          'messaging.message.id': job.id ?? '',
          'bullmq.job.attempts_made': job.attemptsMade,
        },
      },
      processor,
    );
  } catch (error) {
    outcome = 'failed';
    throw error;
  } finally {
    queueJobDuration.observe(
      { queue: queueName, outcome },
      Number(process.hrtime.bigint() - startedAt) / 1e9,
    );
  }
}

export { SpanKind, SpanStatusCode };
