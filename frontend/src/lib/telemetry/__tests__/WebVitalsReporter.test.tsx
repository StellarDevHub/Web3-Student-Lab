import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebVitalsReporter } from '../WebVitalsReporter';

const telemetryMocks = vi.hoisted(() => ({
  pathname: '/courses',
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn(),
  startSpan: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => telemetryMocks.pathname,
}));

vi.mock('web-vitals', () => ({
  onCLS: telemetryMocks.onCLS,
  onLCP: telemetryMocks.onLCP,
  onFCP: telemetryMocks.onFCP,
  onTTFB: telemetryMocks.onTTFB,
}));

vi.mock('web-vitals/attribution', () => ({
  onINP: telemetryMocks.onINP,
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  SimpleSpanProcessor: vi.fn(),
}));

vi.mock('@opentelemetry/sdk-trace-web', () => ({
  WebTracerProvider: vi.fn().mockImplementation(() => ({
    getTracer: () => ({ startSpan: telemetryMocks.startSpan }),
  })),
}));

describe('WebVitalsReporter', () => {
  beforeEach(() => {
    telemetryMocks.pathname = '/courses';
    telemetryMocks.onCLS.mockReset();
    telemetryMocks.onINP.mockReset();
    telemetryMocks.onLCP.mockReset();
    telemetryMocks.onFCP.mockReset();
    telemetryMocks.onTTFB.mockReset();
    telemetryMocks.startSpan.mockReset().mockReturnValue({
      setAttributes: vi.fn(),
      end: vi.fn(),
    });
    delete window.__webVitalsTracer;
  });

  it('records Web Vitals and an attributed diagnostic for INP over 200 ms on route changes', () => {
    const { rerender } = render(<WebVitalsReporter />);
    const inpCallback = telemetryMocks.onINP.mock.calls[0]?.[0] as (metric: {
      name: string;
      value: number;
      rating: string;
      id: string;
      entries: PerformanceEntry[];
      attribution: { interactionTarget: string; interactionType: string };
    }) => void;

    act(() => {
      inpCallback({
        name: 'INP',
        value: 240,
        rating: 'poor',
        id: 'inp-1',
        entries: [],
        attribution: { interactionTarget: '.slow-button', interactionType: 'pointer' },
      });
    });

    telemetryMocks.pathname = '/dashboard';
    rerender(<WebVitalsReporter />);

    const spanNames = telemetryMocks.startSpan.mock.calls.map(([name]) => name);
    expect(spanNames).toEqual(['web-vital', 'slow-interaction', 'route-change', 'web-vital']);
    expect(telemetryMocks.startSpan.mock.results[1]?.value.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'diagnostic.component': '.slow-button',
        'web_vital.value': 240,
      })
    );
    expect(telemetryMocks.startSpan.mock.results[3]?.value.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'page.route': '/dashboard' })
    );
  });
});
