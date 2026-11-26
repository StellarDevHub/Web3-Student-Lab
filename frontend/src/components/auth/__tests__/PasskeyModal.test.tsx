import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  detectAuthenticatorCapabilities: vi.fn(),
  registerPasskey: vi.fn(),
  signInWithPasskeySep10: vi.fn(),
  cancelPasskeyCeremony: vi.fn(),
}));

vi.mock('@/lib/passkey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/passkey')>();
  return { ...actual, ...lib };
});

import { PasskeyError, getFriendlyPasskeyMessage } from '@/lib/passkey';
import { PasskeyModal } from '../PasskeyModal';

const caps = (overrides = {}) => ({
  webauthn: true,
  platformAuthenticator: true,
  conditionalMediation: false,
  prf: true,
  platformLabel: 'Touch ID',
  ...overrides,
});

function renderRegister(props: Partial<React.ComponentProps<typeof PasskeyModal>> = {}) {
  const onRegistered = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <PasskeyModal
      mode="register"
      open
      onOpenChange={onOpenChange}
      userId="user_1"
      userName="user_1@example.com"
      userDisplayName="Student"
      existingNicknames={['Touch ID']}
      onRegistered={onRegistered}
      {...(props as object)}
    />
  );
  return { onRegistered, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  lib.detectAuthenticatorCapabilities.mockResolvedValue(caps());
});

describe('PasskeyModal — registration', () => {
  it('offers biometrics and security keys and suggests a unique nickname', async () => {
    renderRegister();
    const platform = await screen.findByRole('radio', { name: /this device \(touch id\)/i });
    expect(platform).toBeChecked();
    expect(screen.getByRole('radio', { name: /security key or phone/i })).toBeEnabled();
    expect(screen.getByLabelText(/passkey name/i)).toHaveValue('Touch ID 2');
  });

  it('falls back to security keys when no biometric sensor exists', async () => {
    lib.detectAuthenticatorCapabilities.mockResolvedValue(caps({ platformAuthenticator: false }));
    renderRegister();
    expect(await screen.findByRole('radio', { name: /this device/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /security key or phone/i })).toBeChecked();
    expect(screen.getByLabelText(/passkey name/i)).toHaveValue('Security key');
  });

  it('blocks duplicate nicknames', async () => {
    renderRegister();
    const input = await screen.findByLabelText(/passkey name/i);
    fireEvent.change(input, { target: { value: 'touch id' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/already have a passkey with this name/i);
    expect(screen.getByRole('button', { name: /create passkey/i })).toBeDisabled();
    expect(lib.registerPasskey).not.toHaveBeenCalled();
  });

  it('recovers from a cancelled biometric prompt with a friendly retry', async () => {
    lib.registerPasskey
      .mockResolvedValueOnce({
        success: false,
        errorCode: 'cancelled',
        error: getFriendlyPasskeyMessage('cancelled'),
      })
      .mockResolvedValueOnce({
        success: true,
        credentialId: 'cred-1',
        authenticatorAttachment: 'cross-platform',
      });
    const { onRegistered } = renderRegister();

    fireEvent.click(await screen.findByRole('radio', { name: /security key or phone/i }));
    fireEvent.change(screen.getByLabelText(/passkey name/i), { target: { value: 'Work YubiKey' } });
    fireEvent.click(screen.getByRole('button', { name: /create passkey/i }));

    expect(await screen.findByRole('heading', { name: 'Prompt cancelled' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no changes were made/i);
    expect(lib.registerPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ authenticator: 'cross-platform', nickname: 'Work YubiKey' })
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('heading', { name: 'Passkey added' })).toBeInTheDocument();
    expect(onRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: 'cred-1', nickname: 'Work YubiKey' })
    );
  });

  it('shows a timeout message distinctly from cancellation', async () => {
    lib.registerPasskey.mockResolvedValue({
      success: false,
      errorCode: 'timeout',
      error: getFriendlyPasskeyMessage('timeout'),
    });
    renderRegister();
    fireEvent.click(await screen.findByRole('button', { name: /create passkey/i }));
    expect(await screen.findByRole('heading', { name: 'Prompt timed out' })).toBeInTheDocument();
  });

  it('suggests a different authenticator when the key is already registered', async () => {
    lib.registerPasskey.mockResolvedValue({
      success: false,
      errorCode: 'already-registered',
      error: getFriendlyPasskeyMessage('already-registered'),
    });
    renderRegister();
    fireEvent.click(await screen.findByRole('button', { name: /create passkey/i }));

    expect(await screen.findByRole('heading', { name: 'Already registered' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use a different authenticator/i }));
    expect(await screen.findByRole('radio', { name: /security key or phone/i })).toBeInTheDocument();
  });

  it('cancels the in-flight ceremony when the user presses Cancel', async () => {
    lib.registerPasskey.mockImplementation(() => new Promise(() => {}));
    renderRegister();
    fireEvent.click(await screen.findByRole('button', { name: /create passkey/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(lib.cancelPasskeyCeremony).toHaveBeenCalled();
  });

  it('explains when the browser has no WebAuthn support', async () => {
    lib.detectAuthenticatorCapabilities.mockResolvedValue(caps({ webauthn: false }));
    renderRegister();
    expect(await screen.findByRole('heading', { name: 'Passkeys not supported' })).toBeInTheDocument();
  });
});

describe('PasskeyModal — biometric re-auth (SEP-0010)', () => {
  function renderReauth() {
    const onAuthenticated = vi.fn();
    render(
      <PasskeyModal
        mode="reauth"
        open
        onOpenChange={vi.fn()}
        credentialId="cred-1"
        credentialLabel="Work YubiKey"
        account="GABC"
        onAuthenticated={onAuthenticated}
      />
    );
    return { onAuthenticated };
  }

  it('retries after a cancelled prompt and completes the SEP-0010 sign-in', async () => {
    const signed = { account: 'GABC', credentialId: 'cred-1', signedTransaction: 'xdr', auth: {} };
    lib.signInWithPasskeySep10
      .mockRejectedValueOnce(new PasskeyError('cancelled'))
      .mockResolvedValueOnce(signed);
    const { onAuthenticated } = renderReauth();

    fireEvent.click(await screen.findByRole('button', { name: /continue with passkey/i }));
    expect(await screen.findByRole('heading', { name: 'Prompt cancelled' })).toBeInTheDocument();
    expect(lib.signInWithPasskeySep10).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'GABC', credentialId: 'cred-1' })
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(signed));
    expect(await screen.findByRole('heading', { name: "You're verified" })).toBeInTheDocument();
  });

  it('explains authenticators without PRF support', async () => {
    lib.signInWithPasskeySep10.mockRejectedValue(new PasskeyError('prf-unsupported'));
    renderReauth();
    fireEvent.click(await screen.findByRole('button', { name: /continue with passkey/i }));
    expect(await screen.findByRole('heading', { name: "Passkey can't sign Stellar challenges" })).toBeInTheDocument();
  });
});
