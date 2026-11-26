import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WidgetSandbox } from '../WidgetSandbox';
import { COMMUNITY_WIDGET_SANDBOX } from '../sandboxProtocol';

describe('WidgetSandbox Component', () => {
  it('renders with title and hardened sandbox configuration', () => {
    render(
      <WidgetSandbox
        widgetId="test-course-widget"
        title="Stellar Community Quiz Sandbox"
        walletContext={{ publicKey: 'GBRPY...', network: 'testnet' }}
      />
    );

    expect(screen.getByText('Stellar Community Quiz Sandbox')).toBeInTheDocument();
    expect(screen.getByText('Isolated Sandbox')).toBeInTheDocument();

    const iframe = screen.getByTestId('mfe-sandbox-iframe') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe(COMMUNITY_WIDGET_SANDBOX);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('allows switching view tabs between Widget View, Security Alerts, and RPC Telemetry', () => {
    render(<WidgetSandbox title="Tab Test Sandbox" />);

    // Click Security Alerts tab
    fireEvent.click(screen.getByRole('button', { name: /Security Alerts/i }));
    expect(screen.getByTestId('security-alerts-panel')).toBeInTheDocument();
    expect(screen.getByText(/No Security Incidents Detected/i)).toBeInTheDocument();

    // Click RPC Telemetry tab
    fireEvent.click(screen.getByRole('button', { name: /RPC Telemetry/i }));
    expect(screen.getByTestId('rpc-telemetry-panel')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for RPC Messages/i)).toBeInTheDocument();

    // Click back to Widget View
    fireEvent.click(screen.getByRole('button', { name: /Widget View/i }));
    expect(screen.getByTestId('mfe-sandbox-iframe')).toBeInTheDocument();
  });

  it('allows selecting the Attacker Simulator demo', () => {
    render(<WidgetSandbox title="Demo Selector Sandbox" />);

    const attackerBtn = screen.getByRole('button', { name: /Attacker Simulator/i });
    fireEvent.click(attackerBtn);

    const iframe = screen.getByTestId('mfe-sandbox-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('Untrusted Community Widget: Attack Simulator');
  });

  it('activates render-boundary isolation when receiving a prohibited RPC method (e.g. wallet theft)', () => {
    const onSecurityAlert = vi.fn();
    const onQuarantine = vi.fn();

    render(
      <WidgetSandbox
        title="Quarantine Test Sandbox"
        onSecurityAlert={onSecurityAlert}
        onQuarantine={onQuarantine}
      />
    );

    const iframe = screen.getByTestId('mfe-sandbox-iframe') as HTMLIFrameElement;

    // Simulate an attack message originating from the iframe's contentWindow
    const maliciousAttackEvent = new MessageEvent('message', {
      data: {
        jsonrpc: '2.0',
        id: 'attack-1',
        method: 'wallet:signTransaction',
        params: { destination: 'GATTACKER' },
        token: 'token-guess',
      },
      origin: 'null',
      source: iframe.contentWindow,
    });

    act(() => {
      window.dispatchEvent(maliciousAttackEvent);
    });

    // Check that render-boundary isolation banner and shield are active
    expect(screen.getByTestId('security-quarantine-banner')).toBeInTheDocument();
    expect(screen.getByTestId('quarantined-boundary-shield')).toBeInTheDocument();
    expect(screen.getByText(/RENDER-BOUNDARY ISOLATION ACTIVATED/i)).toBeInTheDocument();
    expect(screen.getByText(/FORBIDDEN_METHOD_ACCESS/i)).toBeInTheDocument();

    expect(onSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FORBIDDEN_METHOD_ACCESS',
        severity: 'critical',
        method: 'wallet:signTransaction',
      })
    );
    expect(onQuarantine).toHaveBeenCalled();
  });

  it('re-sets sandbox and clears quarantine when clicking Reset Sandbox', () => {
    render(<WidgetSandbox title="Reset Test Sandbox" />);

    const iframe = screen.getByTestId('mfe-sandbox-iframe') as HTMLIFrameElement;

    // Trigger violation
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            jsonrpc: '2.0',
            id: 'exploit-1',
            method: 'wallet:getSecretKey',
            token: 'test',
          },
          origin: 'null',
          source: iframe.contentWindow,
        })
      );
    });

    expect(screen.getByTestId('security-quarantine-banner')).toBeInTheDocument();

    // Click Reset Sandbox
    const resetBtn = screen.getByTestId('reset-sandbox-button');
    fireEvent.click(resetBtn);

    // Quarantine should now be cleared
    expect(screen.queryByTestId('security-quarantine-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quarantined-boundary-shield')).not.toBeInTheDocument();
    expect(screen.getByTestId('mfe-sandbox-iframe')).toBeInTheDocument();
  });
});
