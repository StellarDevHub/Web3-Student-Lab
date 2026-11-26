import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MicrofrontendsPage from '../page';

// Mock WalletContext
vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({
    publicKey: 'GAAAZZZ111222333',
    network: 'TESTNET',
  }),
}));

// Mock MicroFrontendHost
vi.mock('@/microfrontends/host/MicroFrontendHost', () => ({
  default: () => <div data-testid="mock-mfe-host">Mock MicroFrontendHost</div>,
}));

// Mock SandboxedLabFrame
vi.mock('@/microfrontends/sandbox/SandboxedLabFrame', () => ({
  SandboxedLabFrame: () => <div data-testid="mock-sandboxed-lab-frame">Mock SandboxedLabFrame</div>,
}));

describe('MicrofrontendsPage', () => {
  it('renders page header and FE-072 badge', () => {
    render(<MicrofrontendsPage />);

    expect(screen.getByRole('heading', { level: 1, name: /Micro-Frontends & Course Widget Sandbox/i })).toBeInTheDocument();
    expect(screen.getByText('FE-072 Hardened')).toBeInTheDocument();
  });

  it('renders the Community Course Widget Sandbox component', () => {
    render(<MicrofrontendsPage />);

    expect(screen.getByRole('heading', { level: 2, name: /Community Course Widget Sandbox/i })).toBeInTheDocument();
    expect(screen.getByTestId('microfrontend-widget-sandbox')).toBeInTheDocument();

    const iframe = screen.getByTestId('mfe-sandbox-iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('renders first-party federated remotes and third-party lab sections', () => {
    render(<MicrofrontendsPage />);

    expect(screen.getByTestId('mock-mfe-host')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sandboxed-lab-frame')).toBeInTheDocument();
  });
});
