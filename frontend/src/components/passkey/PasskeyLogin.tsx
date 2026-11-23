/**
 * PasskeyLogin Component
 *
 * React component for authenticating with an existing passkey.
 * This component handles the WebAuthn authentication ceremony:
 * 1. Checks WebAuthn support
 * 2. Requests authentication challenge
 * 3. Prompts user for biometric (TouchID/FaceID)
 * 4. Verifies the assertion
 * 5. Issues session token
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  authenticatePasskey,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getAuthenticatorName,
  getUserCredentials,
} from '@/lib/passkey';
import {
  getStoredCredentials,
  updateCredentialSignCount,
} from '@/lib/credentialStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PasskeyLoginProps {
  onLoginSuccess?: (credentialId: string) => void;
  onLoginFailed?: (error: string) => void;
  onRegisterClick?: () => void;
}

type LoginStep =
  | 'checking'
  | 'ready'
  | 'authenticating'
  | 'complete'
  | 'error'
  | 'no-credentials';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasskeyLogin({
  onLoginSuccess,
  onLoginFailed,
  onRegisterClick,
}: PasskeyLoginProps) {
  const [step, setStep] = useState<LoginStep>('checking');
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const [credentialCount, setCredentialCount] = useState<number>(0);

  // Check WebAuthn support on mount
  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    if (!isWebAuthnSupported()) {
      setError('WebAuthn is not supported in this browser. Please use a modern browser with biometric support.');
      setStep('error');
      return;
    }

    const platformAvailable = await isPlatformAuthenticatorAvailable();
    if (!platformAvailable) {
      setError('Biometric authentication is not available on this device.');
      setStep('error');
      return;
    }

    setDeviceName(getAuthenticatorName());

    // Check if user has stored credentials
    const storedCredentials = await getStoredCredentials();
    if (storedCredentials.length === 0) {
      setStep('no-credentials');
      return;
    }

    setCredentialCount(storedCredentials.length);
    setStep('ready');
  };

  const handleAuthenticate = useCallback(async () => {
    try {
      setStep('authenticating');
      setError(null);

      // 1. Authenticate with passkey
      const result = await authenticatePasskey();

      if (!result.success || !result.verified) {
        throw new Error(result.error || 'Authentication failed');
      }

      // 2. Update local credential sign count
      if (result.credentialId) {
        await updateCredentialSignCount(result.credentialId, 0);
      }

      setStep('complete');
      onLoginSuccess?.(result.credentialId || '');
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err.message || 'Authentication failed');
      setStep('error');
      onLoginFailed?.(err.message);
    }
  }, [onLoginSuccess, onLoginFailed]);

  const handleRetry = () => {
    setError(null);
    setStep('ready');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (step === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        <p className="text-gray-600">Checking biometric support...</p>
      </div>
    );
  }

  if (step === 'no-credentials') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">No Passkeys Found</h3>
        <p className="text-gray-600 text-center max-w-md">
          You haven&apos;t registered a passkey on this device yet.
          Create a new passkey wallet to get started.
        </p>
        {onRegisterClick && (
          <button
            onClick={onRegisterClick}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                       hover:bg-blue-700 transition-colors"
          >
            Create Passkey Wallet
          </button>
        )}
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Authentication Failed</h3>
        <p className="text-gray-600 text-center max-w-md">{error}</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Welcome Back!</h3>
        <p className="text-gray-600 text-center max-w-md">
          You&apos;ve been authenticated successfully.
        </p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      {/* Title */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900">
          Sign In with Passkey
        </h3>
        <p className="text-gray-600 mt-2">
          Use {deviceName} to sign in to your wallet.
        </p>
      </div>

      {/* Credential Info */}
      <div className="bg-gray-50 rounded-lg p-4 w-full max-w-md">
        <p className="text-sm text-gray-600 text-center">
          {credentialCount} passkey{credentialCount !== 1 ? 's' : ''} registered on this device
        </p>
      </div>

      {/* Authenticate Button */}
      <button
        onClick={handleAuthenticate}
        disabled={step === 'authenticating'}
        className="w-full max-w-md px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                   hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors flex items-center justify-center space-x-2"
      >
        {step === 'authenticating' ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            <span>Verifying...</span>
          </>
        ) : (
          <>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>Sign In with {deviceName}</span>
          </>
        )}
      </button>

      {/* Register Link */}
      {onRegisterClick && (
        <button
          onClick={onRegisterClick}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          Don&apos;t have a passkey? Create one
        </button>
      )}

      {/* Info */}
      <p className="text-xs text-gray-500 text-center max-w-md">
        Your biometric data never leaves this device. We only verify the cryptographic signature.
      </p>
    </div>
  );
}

export default PasskeyLogin;
