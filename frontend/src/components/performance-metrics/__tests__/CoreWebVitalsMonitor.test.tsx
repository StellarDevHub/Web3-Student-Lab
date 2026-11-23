import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreWebVitalsMonitor } from '../CoreWebVitalsMonitor';

describe('CoreWebVitalsMonitor Component', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16);
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  it('renders the FPS counter widget and core web vitals cards', () => {
    render(<CoreWebVitalsMonitor />);

    expect(screen.getByTestId('fps-counter-widget')).toBeInTheDocument();
    expect(screen.getByText(/Live Frame Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/INP \(Interaction Lag\)/i)).toBeInTheDocument();
    expect(screen.getByText(/LCP \(Largest Paint\)/i)).toBeInTheDocument();
    expect(screen.getByText(/CLS \(Layout Shift\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Target: <50ms/i)).toBeInTheDocument();
  });

  it('toggles console logging on demand', () => {
    render(<CoreWebVitalsMonitor />);

    const checkbox = screen.getByLabelText(/toggle console web vitals logging/i);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('handles keystrokes in benchmark input and measures interaction latency under 50ms', async () => {
    render(<CoreWebVitalsMonitor />);

    const input = screen.getByLabelText(/High-Speed Typing Benchmark Input/i);
    fireEvent.change(input, { target: { value: 'fn process_order() {' } });

    await waitFor(() => {
      expect(screen.getByText(/INP < 50ms Optimal/i)).toBeInTheDocument();
    });
  });

  it('flushes telemetry payload and confirms dispatch timestamp', async () => {
    render(<CoreWebVitalsMonitor />);

    const flushBtn = screen.getByRole('button', { name: /flush telemetry snapshot/i });
    fireEvent.click(flushBtn);

    await waitFor(() => {
      expect(screen.getByText(/Telemetry payload dispatched successfully/i)).toBeInTheDocument();
    });
  });
});
