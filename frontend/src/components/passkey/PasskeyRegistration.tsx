/**
 * PasskeyRegistration Component
 *
 * React component for registering a new passkey using biometric authentication.
 * This component handles the complete WebAuthn registration ceremony:
 * 1. Checks WebAuthn support
 * 2. Requests registration challenge
 * 3. Prompts user for biometric (TouchID/FaceID)
 * 4. Verifies and stores the credential
 * 5. Creates on-chain wallet
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  registerPasskey,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getAuthenticatorName,
} from '@/lib/passkey';
import {
  addCredential,
  storeWalletData,
  StoredCredential,
  StoredWalletData,
} from '@/lib/credentialStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PasskeyRegistrationProps {
  userId: string;
  userName: string;
  userDisplayName: string;
  onRegistrationComplete?: (credentialId: string, walletAddress: string) => void;
  onRegistrationFailed?: (error: string) => void;
}

type RegistrationStep =
  | 'checking'
  | 'ready'
  | 'registering'
  | 'creating-wallet'
  | 'complete'
  | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasskeyRegistration({
  userId,
  userName,
  userDisplayName,
  onRegistrationComplete,
  onRegistrationFailed,
}: PasskeyRegistrationProps) {
  const [step, setStep] = useState<RegistrationStep>('checking');
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');

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
      setError('Biometric authentication is not available on this device. Please ensure TouchID, FaceID, or Windows Hello is set up.');
      setStep('error');
      return;
    }

    setDeviceName(getAuthenticatorName());
    setStep('ready');
  };

  const handleRegister = useCallback(async () => {
    try {
      setStep('registering');
      setError(null);

      // 1. Register passkey
      const result = await registerPasskey({
        userId,
        userName,
        userDisplayName,
      });

      if (!result.success || !result.credentialId) {
        throw new Error(result.error || 'Registration failed');
      }

      // 2. Store credential locally (encrypted)
      const credential: StoredCredential = {
        id: result.credentialId,
        credentialId: result.credentialId,
        publicKeyX: result.publicKeyX || '',
        publicKeyY: result.publicKeyY || '',
        signCount: 0,
        deviceName,
        createdAt: new Date().toISOString(),
      };

      await addCredential(credential);

      // 3. Create on-chain wallet (this would call the Soroban contract)
      setStep('creating-wallet');

      // Simulate wallet creation (in production, this would deploy the contract)
      const mockWalletAddress = `G${generateStellarAddress()}`;
      setWalletAddress(mockWalletAddress);

      // 4. Store wallet data locally
      const walletData: StoredWalletData = {
        walletAddress: mockWalletAddress,
        passkeyCredentialId: result.credentialId,
        guardians: [],
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      };

      await storeWalletData(walletData);

      setStep('complete');
      onRegistrationComplete?.(result.credentialId, mockWalletAddress);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
      setStep('error');
      onRegistrationFailed?.(err.message);
    }
  }, [userId, userName, userDisplayName, deviceName, onRegistrationComplete, onRegistrationFailed]);

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
        <h3 className="text-lg font-semibold text-gray-900">Registration Failed</h3>
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
        <h3 className="text-lg font-semibold text-gray-900">Passkey Registered!</h3>
        <p className="text-gray-600 text-center max-w-md">
          Your biometric wallet has been created successfully.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 w-full max-w-md">
          <p className="text-sm text-gray-500">Wallet Address</p>
          <p className="font-mono text-sm text-gray-900 break-all">{walletAddress}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 w-full max-w-md">
          <p className="text-sm text-blue-700">
            <strong>Important:</strong> Your passkey is stored securely on this device.
            Make sure to set up social recovery guardians for backup access.
          </p>
        </div>
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
          Create Your Passkey Wallet
        </h3>
        <p className="text-gray-600 mt-2">
          Use {deviceName} to create a secure, passwordless wallet.
        </p>
      </div>

      {/* Benefits */}
      <div className="bg-gray-50 rounded-lg p-4 w-full max-w-md space-y-2">
        <div className="flex items-center space-x-3">
          <svg
            className="w-5 h-5 text-green-600"
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
          <span className="text-sm text-gray-700">No passwords to remember</span>
        </div>
        <div className="flex items-center space-x-3">
          <svg
            className="w-5 h-5 text-green-600"
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
          <span className="text-sm text-gray-700">Phishing-resistant by design</span>
        </div>
        <div className="flex items-center space-x-3">
          <svg
            className="w-5 h-5 text-green-600"
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
          <span className="text-sm text-gray-700">Works across your devices</span>
        </div>
      </div>

      {/* Register Button */}
      <button
        onClick={handleRegister}
        disabled={step === 'registering' || step === 'creating-wallet'}
        className="w-full max-w-md px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                   hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors flex items-center justify-center space-x-2"
      >
        {step === 'registering' ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            <span>Creating Passkey...</span>
          </>
        ) : step === 'creating-wallet' ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            <span>Creating Wallet...</span>
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
            <span>Create Wallet with {deviceName}</span>
          </>
        )}
      </button>

      {/* Info */}
      <p className="text-xs text-gray-500 text-center max-w-md">
        Your passkey never leaves this device. Only a public key is stored on our servers.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateStellarAddress(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  for (let i = 0; i < 55; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default PasskeyRegistration;
