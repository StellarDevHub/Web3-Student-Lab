'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { SimpleSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import type { Attributes, Tracer } from '@opentelemetry/api';
import { onCLS, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { onINP } from 'web-vitals/attribution';
import { getApiEndpoint } from '@/lib/env';

type ExportCallback = Parameters<SpanExporter['export']>[1];

class BeaconSpanExporter implements SpanExporter {
  export(spans: Parameters<SpanExporter['export']>[0], resultCallback: ExportCallback) {
    const endpoint = getApiEndpoint('/metrics');
    const body = JSON.stringify({
      spans: spans.map(({ name, attributes }) => ({ name, attributes })),
    });
    const beacon = new Blob([body], { type: 'text/plain;charset=UTF-8' });

    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(endpoint, beacon)) {
      resultCallback({ code: 0 });
      return;
    }

    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
      keepalive: true,
    }).then(
      (response) => {
        resultCallback(
          response.ok
            ? { code: 0 }
            : { code: 1, error: new Error(`Web Vitals beacon failed: ${response.status}`) }
        );
      },
      (error: unknown) =>
        resultCallback({
          code: 1,
          error: error instanceof Error ? error : new Error(String(error)),
        })
    );
  }

  shutdown() {
    return Promise.resolve();
  }
}

declare global {
  interface Window {
    __webVitalsTracer?: Tracer;
  }
}

function getTracer(): Tracer {
  if (!window.__webVitalsTracer) {
    const provider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new BeaconSpanExporter())],
    });
    window.__webVitalsTracer = provider.getTracer('web-vitals');
  }

  return window.__webVitalsTracer;
}

function emitSpan(name: string, attributes: Attributes) {
  const span = getTracer().startSpan(name);
  span.setAttributes(attributes);
  span.end();
}

function getDeviceAttributes(): Attributes {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;

  return {
    'device.hardware_concurrency': navigator.hardwareConcurrency,
    ...(navigatorWithMemory.deviceMemory !== undefined && {
      'device.memory_gb': navigatorWithMemory.deviceMemory,
    }),
    ...(connection?.effectiveType && { 'device.connection': connection.effectiveType }),
  };
}

function reportMetric(metric: Metric, route: string) {
  emitSpan('web-vital', {
    'web_vital.name': metric.name,
    'web_vital.value': metric.value,
    'web_vital.rating': metric.rating,
    'web_vital.id': metric.id,
    'page.route': route,
    ...getDeviceAttributes(),
  });
}

export function WebVitalsReporter() {
  const pathname = usePathname() ?? '/';
  const pathnameRef = useRef(pathname);
  const previousPathnameRef = useRef<string | null>(null);
  const latestMetricsRef = useRef(new Map<string, Metric>());

  useEffect(() => {
    const report = (metric: Metric) => {
      latestMetricsRef.current.set(metric.name, metric);
      reportMetric(metric, pathnameRef.current);
    };

    const options = { reportAllChanges: true, reportSoftNavs: true };
    onCLS(report, options);
    onINP((metric) => {
      latestMetricsRef.current.set(metric.name, metric);
      reportMetric(metric, pathnameRef.current);
      if (metric.value > 200) {
        const component = metric.attribution.interactionTarget?.slice(0, 160) ?? 'unknown';
        emitSpan('slow-interaction', {
          'diagnostic.type': 'high-inp',
          'diagnostic.component': component,
          'web_vital.value': metric.value,
          'page.route': pathnameRef.current,
          'interaction.target': component,
          'interaction.type': metric.attribution.interactionType ?? 'unknown',
          ...getDeviceAttributes(),
        });
      }
    }, options);
    onLCP(report, options);
    onFCP(report, options);
    onTTFB(report, options);
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname;
      return;
    }
    if (previousPathnameRef.current === pathname) return;

    emitSpan('route-change', { 'page.route': pathname });
    latestMetricsRef.current.forEach((metric) => {
      reportMetric(metric, pathname);
    });
    previousPathnameRef.current = pathname;
  }, [pathname]);

  return null;
}
