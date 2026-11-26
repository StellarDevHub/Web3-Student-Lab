'use client';

/**
 * PasskeyModal
 *
 * Guides a student through a WebAuthn ceremony with clear, recoverable states:
 *
 *  - `register`: choose Touch ID / Face ID / Windows Hello or a hardware
 *    security key (YubiKey), name the key, then create the passkey.
 *  - `reauth`:   biometric re-authentication that signs a SEP-0010 challenge
 *    with the passkey-derived Stellar key and exchanges it for a session.
 *
 * Cancelled or timed-out prompts never dead-end: the modal explains what
 * happened and offers "Try again" or "Use a different authenticator".
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import {
  cancelPasskeyCeremony,
  detectAuthenticatorCapabilities,
  getFriendlyPasskeyMessage,
  PasskeyError,
  registerPasskey,
  signInWithPasskeySep10,
  suggestPasskeyNickname,
  validatePasskeyNickname,
  type AuthenticatorCapabilities,
  type AuthenticatorPreference,
  type PasskeyErrorCode,
  type RegistrationResult,
  type Sep10SignInResult,
  type Sep10Transport,
} from '@/lib/passkey';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface PasskeyRegisterModalProps extends BaseProps {
  mode: 'register';
  userId: string;
  userName: string;
  userDisplayName: string;
  /** Nicknames already in use, for uniqueness validation and suggestions. */
  existingNicknames?: string[];
  /** Persist the new credential. Throwing here surfaces a friendly error. */
  onRegistered: (result: RegistrationResult & { nickname: string }) => void | Promise<void>;
}

export interface PasskeyReauthModalProps extends BaseProps {
  mode: 'reauth';
  /** Restrict the prompt to this credential. */
  credentialId?: string;
  /** Label shown to the user, e.g. the passkey nickname. */
  credentialLabel?: string;
  /** Expected Stellar account; binds the assertion to the SEP-0010 tx hash. */
  account?: string;
  /** Why we are asking, e.g. "to submit your quiz on-chain". */
  reason?: string;
  transport?: Sep10Transport;
  onAuthenticated: (result: Sep10SignInResult) => void | Promise<void>;
}

export type PasskeyModalProps = PasskeyRegisterModalProps | PasskeyReauthModalProps;

type Phase = 'detecting' | 'configure' | 'prompting' | 'finalizing' | 'success' | 'error';

interface ErrorState {
  code: PasskeyErrorCode;
  message: string;
  retryable: boolean;
}

const ERROR_TITLES: Record<PasskeyErrorCode, string> = {
  unsupported: 'Passkeys not supported',
  'no-authenticator': 'No biometric sensor found',
  cancelled: 'Prompt cancelled',
  timeout: 'Prompt timed out',
  'already-registered': 'Already registered',
  'invalid-domain': 'Unsafe address',
  'unsupported-algorithm': 'Authenticator not compatible',
  'prf-unsupported': "Passkey can't sign Stellar challenges",
  'credential-mismatch': 'Wrong passkey',
  'challenge-invalid': 'Challenge rejected',
  network: 'Connection problem',
  server: 'Server error',
  unknown: 'Something went wrong',
};

/** Errors that are best solved by picking a different authenticator. */
const SWITCH_AUTHENTICATOR: ReadonlySet<PasskeyErrorCode> = new Set<PasskeyErrorCode>([
  'already-registered',
  'no-authenticator',
  'unsupported-algorithm',
  'prf-unsupported',
]);

function toErrorState(err: unknown): ErrorState {
  if (err instanceof PasskeyError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }
  return { code: 'unknown', message: getFriendlyPasskeyMessage('unknown'), retryable: true };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasskeyModal(props: PasskeyModalProps) {
  const { open, onOpenChange, mode } = props;
  const [phase, setPhase] = useState<Phase>('detecting');
  const [caps, setCaps] = useState<AuthenticatorCapabilities | null>(null);
  const [authenticator, setAuthenticator] = useState<AuthenticatorPreference>('platform');
  const [nickname, setNickname] = useState('');
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [successLabel, setSuccessLabel] = useState('');
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const nicknameId = useId();

  const existingNicknames = mode === 'register' ? (props.existingNicknames ?? []) : [];
  // Read through a ref so saving a new key (which updates the parent's list)
  // doesn't re-run detection and wipe the success screen.
  const existingRef = useRef(existingNicknames);
  existingRef.current = existingNicknames;

  // Reset + detect capabilities every time the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase('detecting');
    setError(null);
    setNicknameTouched(false);
    detectAuthenticatorCapabilities().then((detected) => {
      if (cancelled) return;
      setCaps(detected);
      if (!detected.webauthn) {
        setError(toErrorState(new PasskeyError('unsupported')));
        setPhase('error');
        return;
      }
      const preferred: AuthenticatorPreference = detected.platformAuthenticator
        ? 'platform'
        : 'cross-platform';
      setAuthenticator(preferred);
      setNickname(suggestPasskeyNickname(preferred, existingRef.current, detected.platformLabel));
      setPhase('configure');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Abort any in-flight browser prompt if the modal unmounts mid-ceremony.
  useEffect(() => {
    return () => {
      if (phaseRef.current === 'prompting') cancelPasskeyCeremony();
    };
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && phaseRef.current === 'prompting') cancelPasskeyCeremony();
      if (!next && phaseRef.current === 'finalizing') return; // don't drop a half-saved key
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const chooseAuthenticator = (choice: AuthenticatorPreference) => {
    setAuthenticator(choice);
    if (!nicknameTouched) {
      setNickname(suggestPasskeyNickname(choice, existingNicknames, caps?.platformLabel));
    }
  };

  const nicknameError =
    mode === 'register' && nicknameTouched
      ? validatePasskeyNickname(nickname, existingNicknames)
      : null;

  // -------------------------------------------------------------------------
  // Ceremonies
  // -------------------------------------------------------------------------

  const runRegistration = async () => {
    if (props.mode !== 'register') return;
    const validation = validatePasskeyNickname(nickname, existingNicknames);
    if (validation) {
      setNicknameTouched(true);
      return;
    }

    setError(null);
    setPhase('prompting');
    const result = await registerPasskey({
      userId: props.userId,
      userName: props.userName,
      userDisplayName: props.userDisplayName,
      nickname: nickname.trim(),
      authenticator,
    });

    if (!result.success) {
      const code = result.errorCode ?? 'unknown';
      setError({
        code,
        message: result.error ?? getFriendlyPasskeyMessage(code),
        retryable: new PasskeyError(code).retryable,
      });
      setPhase('error');
      return;
    }

    setPhase('finalizing');
    try {
      const label = nickname.trim();
      await props.onRegistered({ ...result, nickname: label });
      setSuccessLabel(label);
      setPhase('success');
    } catch (err) {
      setError(toErrorState(err));
      setPhase('error');
    }
  };

  const runReauth = async () => {
    if (props.mode !== 'reauth') return;
    setError(null);
    setPhase('prompting');
    try {
      const result = await signInWithPasskeySep10({
        account: props.account,
        credentialId: props.credentialId,
        transport: props.transport,
      });
      setPhase('finalizing');
      await props.onAuthenticated(result);
      setSuccessLabel(props.credentialLabel ?? 'your passkey');
      setPhase('success');
    } catch (err) {
      setError(toErrorState(err));
      setPhase('error');
    }
  };

  const start = () => (mode === 'register' ? runRegistration() : runReauth());

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const platformLabel = caps?.platformLabel ?? 'This device';
  const title =
    phase === 'error' && error
      ? ERROR_TITLES[error.code]
      : phase === 'success'
        ? mode === 'register'
          ? 'Passkey added'
          : "You're verified"
        : mode === 'register'
          ? 'Add a passkey'
          : "Confirm it's you";

  const promptHint =
    mode === 'reauth'
      ? `Use ${props.mode === 'reauth' && props.credentialLabel ? props.credentialLabel : 'your passkey'} to approve the sign-in.`
      : authenticator === 'platform'
        ? `Follow the ${platformLabel} prompt from your browser.`
        : authenticator === 'cross-platform'
          ? 'Insert or tap your security key, then touch it when it blinks. You can also scan the QR code with your phone.'
          : 'Choose an authenticator in the browser prompt.';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div data-testid="passkey-modal" data-phase={phase} className="space-y-5">
        <DialogHeader>
          <DialogTitle className="text-gray-900">{title}</DialogTitle>
          {phase === 'configure' && (
            <DialogDescription className="text-gray-600">
              {mode === 'register'
                ? 'Passkeys replace passwords with your fingerprint, face or a hardware key. You can register several and name each one.'
                : (props.mode === 'reauth' && props.reason) ||
                  'Verify with your passkey to sign the Stellar SEP-0010 challenge and start a secure session.'}
            </DialogDescription>
          )}
        </DialogHeader>

        <div aria-live="polite" className="sr-only">
          {phase === 'prompting' ? 'Waiting for your authenticator' : ''}
          {phase === 'error' && error ? error.message : ''}
          {phase === 'success' ? title : ''}
        </div>

        {phase === 'detecting' && (
          <Spinner label="Checking which authenticators this device supports…" />
        )}

        {phase === 'configure' && mode === 'register' && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-gray-700">Authenticator</legend>
              <AuthenticatorOption
                name="authenticator"
                value="platform"
                checked={authenticator === 'platform'}
                disabled={!caps?.platformAuthenticator}
                onSelect={chooseAuthenticator}
                title={`This device (${platformLabel})`}
                description={
                  caps?.platformAuthenticator
                    ? 'Use the fingerprint, face or PIN unlock built into this device.'
                    : 'No biometric sensor detected on this device.'
                }
              />
              <AuthenticatorOption
                name="authenticator"
                value="cross-platform"
                checked={authenticator === 'cross-platform'}
                onSelect={chooseAuthenticator}
                title="Security key or phone"
                description="A YubiKey or other FIDO2 key over USB/NFC, or a phone via QR code."
              />
            </fieldset>

            <div>
              <label htmlFor={nicknameId} className="mb-1 block text-sm font-medium text-gray-700">
                Passkey name
              </label>
              <input
                id={nicknameId}
                type="text"
                value={nickname}
                maxLength={64}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setNicknameTouched(true);
                }}
                aria-invalid={!!nicknameError}
                aria-describedby={nicknameError ? `${nicknameId}-error` : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="e.g. Work YubiKey"
              />
              {nicknameError && (
                <p id={`${nicknameId}-error`} role="alert" className="mt-1 text-xs text-red-600">
                  {nicknameError}
                </p>
              )}
            </div>

            {caps?.prf === false && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                This browser can&apos;t derive a Stellar signing key from passkeys yet. The passkey
                will still work for sign-in, but on-chain SEP-0010 sign-in needs a recent Chrome,
                Edge or Safari.
              </p>
            )}

            <ModalActions
              primary={{ label: 'Create passkey', onClick: start, disabled: !!nicknameError }}
              secondary={{ label: 'Cancel', onClick: () => handleOpenChange(false) }}
            />
          </div>
        )}

        {phase === 'configure' && mode === 'reauth' && (
          <ModalActions
            primary={{ label: 'Continue with passkey', onClick: start }}
            secondary={{ label: 'Cancel', onClick: () => handleOpenChange(false) }}
          />
        )}

        {phase === 'prompting' && (
          <div className="space-y-4">
            <Spinner label={promptHint} />
            <ModalActions secondary={{ label: 'Cancel', onClick: () => cancelPasskeyCeremony() }} />
          </div>
        )}

        {phase === 'finalizing' && (
          <Spinner
            label={
              mode === 'register'
                ? 'Saving your passkey…'
                : 'Verifying your signature with the SEP-0010 gateway…'
            }
          />
        )}

        {phase === 'error' && error && (
          <div className="space-y-4">
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error.message}
            </p>
            <ModalActions
              primary={
                error.retryable
                  ? { label: 'Try again', onClick: start }
                  : mode === 'register' && SWITCH_AUTHENTICATOR.has(error.code)
                    ? {
                        label: 'Use a different authenticator',
                        onClick: () => {
                          setError(null);
                          setPhase('configure');
                        },
                      }
                    : undefined
              }
              secondary={{ label: 'Close', onClick: () => handleOpenChange(false) }}
              tertiary={
                error.retryable && mode === 'register'
                  ? {
                      label: 'Change authenticator',
                      onClick: () => {
                        setError(null);
                        setPhase('configure');
                      },
                    }
                  : undefined
              }
            />
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-4">
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {mode === 'register'
                ? `“${successLabel}” is ready. You can now sign in with it.`
                : `Signed in with ${successLabel}.`}
            </p>
            <ModalActions primary={{ label: 'Done', onClick: () => handleOpenChange(false) }} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
      />
      <p className="text-sm text-gray-700">{label}</p>
    </div>
  );
}

function AuthenticatorOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
  title,
  description,
}: {
  name: string;
  value: AuthenticatorPreference;
  checked: boolean;
  disabled?: boolean;
  onSelect: (value: AuthenticatorPreference) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-600">{description}</span>
      </span>
    </label>
  );
}

interface ActionSpec {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ModalActions({
  primary,
  secondary,
  tertiary,
}: {
  primary?: ActionSpec;
  secondary?: ActionSpec;
  tertiary?: ActionSpec;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {tertiary && (
        <button
          type="button"
          onClick={tertiary.onClick}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:text-gray-900 sm:mr-auto"
        >
          {tertiary.label}
        </button>
      )}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {secondary.label}
        </button>
      )}
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {primary.label}
        </button>
      )}
    </div>
  );
}

export default PasskeyModal;
