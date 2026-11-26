import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDecodedXdrEnvelope,
  classifyPriority,
  MempoolCanvas,
  priorityColor,
} from '../MempoolCanvas';

describe('MempoolCanvas', () => {
  it('classifies fee bids into priority levels relative to baseFee', () => {
    expect(classifyPriority(5, 12)).toBe('UNDERPRICED');
    expect(classifyPriority(25, 12)).toBe('STANDARD');
    expect(classifyPriority(75, 12)).toBe('HIGH');
    expect(classifyPriority(150, 12)).toBe('CRITICAL');
  });

  it('maps each priority level to a distinct RGB/hex color', () => {
    expect(priorityColor('CRITICAL').hex).toBe('#ef4444');
    expect(priorityColor('HIGH').hex).toBe('#f59e0b');
    expect(priorityColor('STANDARD').hex).toBe('#10b981');
    expect(priorityColor('UNDERPRICED').hex).toBe('#64748b');
  });

  it('builds a deterministic decoded XDR envelope with base64 payload', () => {
    const env = buildDecodedXdrEnvelope(42, 'SWAP', 140, 180_000, 2, 'CRITICAL');
    expect(env.envelopeType).toBe('ENVELOPE_TYPE_TX_FEE_BUMP');
    expect(env.sourceAccount.startsWith('G')).toBe(true);
    expect(env.operationCount).toBe(2);
    expect(env.operations).toHaveLength(2);
    expect(env.feePerOpStroops).toBe(14_000);
    expect(env.feeStroops).toBe(28_000);
    expect(env.xdrBase64.length).toBeGreaterThan(10);
  });

  it('renders 5,000+ particles by default and gracefully falls back to 2D canvas when WebGL is unavailable', () => {
    render(<MempoolCanvas pool={[]} baseFee={12} />);

    expect(screen.getByTestId('particle-count-badge')).toHaveTextContent('5,000 TX');
    expect(screen.getByTestId('renderer-mode-badge')).toHaveTextContent('2D Fallback');
    expect(screen.getByTestId('mempool-canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '10k' }));
    expect(screen.getByTestId('particle-count-badge')).toHaveTextContent('10,000 TX');
  });

  it('inspects a clicked particle and displays decoded XDR envelope, fee bids, and priority level', () => {
    const onSelect = vi.fn();
    render(
      <MempoolCanvas
        pool={[
          {
            id: '0xdeadbeef01',
            from: '0x1234…5678',
            type: 'SWAP',
            gasUnits: 180_000,
            feeBid: 150,
            addedAt: Date.now(),
          },
        ]}
        baseFee={12}
        initialParticleCount={5_000}
        onSelectParticle={onSelect}
      />,
    );

    const canvas = screen.getByTestId('mempool-canvas');
    // Mock bounding rect and click across the center of the dense 5,000-particle field.
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 420,
      right: 800,
      bottom: 420,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.click(canvas, { clientX: 250, clientY: 210 });

    const inspector = screen.getByTestId('xdr-inspector-panel');
    expect(inspector).toBeInTheDocument();
    expect(inspector).toHaveTextContent(/PRIORITY/i);
    expect(inspector).toHaveTextContent(/Decoded XDR Envelope/i);
    expect(inspector).toHaveTextContent(/Raw Base64 XDR/i);
    expect(inspector).toHaveTextContent(/gwei/i);
    expect(onSelect).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close XDR inspector' }));
    expect(screen.queryByTestId('xdr-inspector-panel')).not.toBeInTheDocument();
  });
});
