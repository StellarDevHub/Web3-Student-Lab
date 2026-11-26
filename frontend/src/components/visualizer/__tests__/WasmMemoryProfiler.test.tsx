import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFlamegraphTree, buildMemoryReport, traceMemoryGrowth } from '@/lib/wasmMemoryProfiler';
import { sorobanLikeContract } from '@/lib/__tests__/fixtures/wasmBuilder';
import { MemoryFlamegraph } from '../MemoryFlamegraph';
import { WasmMemoryProfiler } from '../WasmMemoryProfiler';
import { baseName, serializeSvg } from '../svgExport';

const createObjectURL = vi.fn((_blob: Blob) => 'blob:profile');
const revokeObjectURL = vi.fn();
let clicked: Array<{ download: string; href: string }> = [];

beforeEach(() => {
  clicked = [];
  createObjectURL.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function lastBlobText(): Promise<string> {
  const blob = createObjectURL.mock.calls.at(-1)![0];
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('MemoryFlamegraph', () => {
  const report = buildMemoryReport(sorobanLikeContract());

  it('renders a bar per call path and highlights hotspots', () => {
    render(<MemoryFlamegraph data={buildFlamegraphTree(report, 'stack')} unitLabel="shadow-stack bytes" />);
    const svg = screen.getByTestId('memory-flamegraph');
    expect(svg).toHaveAttribute('aria-label', expect.stringMatching(/Total 8\.3 KB/));
    const helper = within(svg).getByRole('button', { name: /^helper — 8\.0 KB/ });
    expect(helper).toHaveAttribute('data-hotspot', 'true');
    expect(within(svg).getByRole('button', { name: /^deposit — 8\.3 KB/ })).toBeInTheDocument();
  });

  it('zooms into a bar on click and reports the selected function', () => {
    const onSelect = vi.fn();
    render(
      <MemoryFlamegraph data={buildFlamegraphTree(report, 'stack')} unitLabel="stack" onSelectFunction={onSelect} />
    );
    const svg = screen.getByTestId('memory-flamegraph');
    fireEvent.click(within(svg).getByRole('button', { name: /^helper/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
    // Zoomed: the helper bar now spans the full width.
    const helperRect = within(svg).getByRole('button', { name: /^helper/ }).querySelector('rect');
    expect(Number(helperRect?.getAttribute('width'))).toBeCloseTo(960, 0);
  });

  it('explains when there is nothing to plot', () => {
    render(<MemoryFlamegraph data={{ name: 'contract', value: 0, children: [] }} unitLabel="shadow-stack bytes" />);
    expect(screen.getByRole('status')).toHaveTextContent(/nothing to plot/i);
  });
});

describe('WasmMemoryProfiler', () => {
  const bytes = sorobanLikeContract({ dataBytes: 20 * 1024 });

  it('shows budget warnings and hotspots, including an over-budget data section', () => {
    render(<WasmMemoryProfiler bytes={bytes} fileName="counter.wasm" />);
    expect(screen.getByTestId('budget-data-section')).toHaveAttribute('data-status', 'warning');
    expect(screen.getByTestId('budget-data-section')).toHaveTextContent(/above the recommended 16\.0 KB budget/);
    const hotspots = screen.getByRole('list', { name: /memory hotspots/i });
    expect(within(hotspots).getByText('Data section over budget')).toBeInTheDocument();
    expect(within(hotspots).getByText('Large stack frame in helper')).toBeInTheDocument();
  });

  it('switches between flamegraph and both sunburst breakdowns', () => {
    render(<WasmMemoryProfiler bytes={bytes} />);
    expect(screen.getByTestId('memory-flamegraph')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /sunburst/i }));
    const sunburst = screen.getByTestId('memory-sunburst');
    // Both the "Shadow stack" group ring and its region segment are labelled.
    expect(within(sunburst).getAllByRole('button', { name: /^Shadow stack — 1\.00 MB/ }).length).toBeGreaterThan(0);
    expect(within(sunburst).getByRole('button', { name: /^Static data/ })).toHaveAttribute('data-hotspot', 'true');

    fireEvent.change(screen.getByLabelText(/breakdown/i), { target: { value: 'binary' } });
    expect(within(screen.getByTestId('memory-sunburst')).getByRole('button', { name: /^Code —/ })).toBeInTheDocument();
  });

  it('selecting a hotspot focuses its function', () => {
    render(<WasmMemoryProfiler bytes={bytes} />);
    fireEvent.click(screen.getByRole('button', { name: /Large stack frame in helper/ }));
    expect(screen.getByTestId('selected-function')).toHaveTextContent(/helper · frame 8\.0 KB/);
  });

  it('runs an execution trace and charts memory growth against the limit', async () => {
    const runTrace = vi.fn((b: Uint8Array) => traceMemoryGrowth(b));
    render(<WasmMemoryProfiler bytes={sorobanLikeContract({ growPages: 400 })} runTrace={runTrace} />);
    fireEvent.click(screen.getByRole('tab', { name: /memory growth/i }));
    fireEvent.click(screen.getByRole('button', { name: /run execution trace/i }));

    const chart = await screen.findByTestId('memory-growth-chart');
    expect(runTrace).toHaveBeenCalledTimes(1);
    expect(within(chart).getByTestId('memory-limit-line')).toHaveTextContent('50.00 MB limit');
    expect(screen.getByText('deposit', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/call stack|overflowed/i)).toBeInTheDocument();
  });

  it('surfaces trace failures without breaking the page', async () => {
    const runTrace = vi.fn(() => Promise.reject(new Error('Execution did not finish within 8s')));
    render(<WasmMemoryProfiler bytes={bytes} runTrace={runTrace} />);
    fireEvent.click(screen.getByRole('tab', { name: /memory growth/i }));
    fireEvent.click(screen.getByRole('button', { name: /run execution trace/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not finish/);
  });

  it('exports the current view as a standalone SVG', async () => {
    render(<WasmMemoryProfiler bytes={bytes} fileName="my counter.wasm" />);
    fireEvent.click(screen.getByRole('button', { name: /export svg/i }));
    expect(clicked[0].download).toBe('my_counter-flamegraph-stack.svg');
    const svg = await lastBlobText();
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('helper');
  });

  it('exports a JSON diagnostic snapshot including the trace once run', async () => {
    render(<WasmMemoryProfiler bytes={bytes} fileName="counter.wasm" runTrace={(b) => traceMemoryGrowth(b)} />);
    fireEvent.click(screen.getByRole('button', { name: /export json/i }));
    expect(clicked[0].download).toBe('counter-memory-profile.json');
    let snapshot = JSON.parse(await lastBlobText());
    expect(snapshot.schema).toBe('web3-student-lab/wasm-memory-profile@1');
    expect(snapshot.report.budgets.find((b: { id: string }) => b.id === 'data-section').status).toBe('warning');
    expect(snapshot.trace).toBeUndefined();

    fireEvent.click(screen.getByRole('tab', { name: /memory growth/i }));
    fireEvent.click(screen.getByRole('button', { name: /run execution trace/i }));
    await screen.findByTestId('memory-growth-chart');
    fireEvent.click(screen.getByRole('button', { name: /export json/i }));
    snapshot = JSON.parse(await lastBlobText());
    expect(snapshot.trace.exports.map((e: { exportName: string }) => e.exportName)).toEqual(['deposit', 'recurse']);
  });

  it('explains invalid modules', () => {
    render(<WasmMemoryProfiler bytes={new Uint8Array([1, 2, 3])} />);
    expect(screen.getByText(/cannot profile this module/i)).toBeInTheDocument();
  });
});

describe('svg export helpers', () => {
  it('produces a sized, namespaced document with a background', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 100');
    const out = serializeSvg(svg as SVGSVGElement);
    expect(out).toContain('width="300"');
    expect(out).toContain('height="100"');
    expect(out).toContain('<rect width="100%" height="100%" fill="#09090b"');
  });

  it('derives safe file names', () => {
    expect(baseName('My Contract.wasm')).toBe('My_Contract');
    expect(baseName(undefined)).toBe('contract');
  });
});
