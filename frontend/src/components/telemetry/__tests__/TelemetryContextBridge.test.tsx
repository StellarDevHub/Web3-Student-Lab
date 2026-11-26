import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  state: {
    publicKey: null as string | null,
    walletNetwork: null as string | null,
    activeNetwork: 'TESTNET',
  },
}));
vi.mock('@/contexts/WalletContext', () => ({ useWallet: () => wallet.state }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));

import { TelemetryContextBridge } from '../TelemetryContextBridge';
import { clearBreadcrumbs, getBreadcrumbs } from '@/lib/telemetry/breadcrumbs';
import { buildStateSnapshot, getMaskedWallet, setTelemetryWallet } from '@/lib/telemetry/context';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('TelemetryContextBridge', () => {
  beforeEach(() => {
    clearBreadcrumbs();
    setTelemetryWallet(null);
    wallet.state = { publicKey: null, walletNetwork: null, activeNetwork: 'TESTNET' };
  });

  it('renders nothing', () => {
    const { container } = render(<TelemetryContextBridge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('makes the connected wallet available to crash reports, masked', () => {
    wallet.state = { publicKey: ACCOUNT, walletNetwork: 'PUBLIC', activeNetwork: 'TESTNET' };
    render(<TelemetryContextBridge />);

    expect(getMaskedWallet()).toBe('GAAA…AWHF');
    const snapshot = buildStateSnapshot();
    expect(snapshot.wallet).toBe('GAAA…AWHF');
    expect(snapshot.walletNetwork).toBe('PUBLIC');
    expect(JSON.stringify(snapshot)).not.toContain(ACCOUNT);
  });

  it('falls back to the app network when the wallet reports none', () => {
    wallet.state = { publicKey: ACCOUNT, walletNetwork: null, activeNetwork: 'TESTNET' };
    render(<TelemetryContextBridge />);
    expect(buildStateSnapshot().walletNetwork).toBe('TESTNET');
  });

  it('clears the wallet when it disconnects', () => {
    wallet.state = { publicKey: ACCOUNT, walletNetwork: null, activeNetwork: 'TESTNET' };
    const { rerender } = render(<TelemetryContextBridge />);
    expect(getMaskedWallet()).not.toBeNull();

    wallet.state = { publicKey: null, walletNetwork: null, activeNetwork: 'TESTNET' };
    rerender(<TelemetryContextBridge />);
    expect(getMaskedWallet()).toBeNull();
    expect(buildStateSnapshot().walletNetwork).toBeNull();
  });

  it('records connect and disconnect in the trail, masked, and nothing for the initial no-wallet state', () => {
    const { rerender } = render(<TelemetryContextBridge />);
    expect(getBreadcrumbs()).toEqual([]);

    wallet.state = { publicKey: ACCOUNT, walletNetwork: null, activeNetwork: 'TESTNET' };
    rerender(<TelemetryContextBridge />);
    wallet.state = { publicKey: null, walletNetwork: null, activeNetwork: 'TESTNET' };
    rerender(<TelemetryContextBridge />);

    expect(getBreadcrumbs().map((c) => c.message)).toEqual([
      'Wallet connected GAAA…AWHF',
      'Wallet disconnected',
    ]);
  });
});
