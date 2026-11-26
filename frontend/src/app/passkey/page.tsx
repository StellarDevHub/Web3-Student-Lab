/**
 * Passkey Wallet Page
 *
 * Main page for the WebAuthn passkey wallet system.
 * This page provides:
 * 1. Passkey registration (new users)
 * 2. Passkey authentication (existing users)
 * 3. Social guardian management
 * 4. Wallet dashboard
 */

'use client';

import React, { useState, useEffect } from 'react';
import { PasskeyLogin } from '@/components/passkey/PasskeyLogin';
import { SocialRecovery } from '@/components/passkey/SocialRecovery';
import { PasskeyModal } from '@/components/auth/PasskeyModal';
import {
  getStoredCredentials,
  getStoredWalletData,
  StoredCredential,
  StoredWalletData,
  clearAllStoredData,
  addCredential,
  storeWalletData,
  renameCredential,
  removeCredential,
  updateStoredCredential,
} from '@/lib/credentialStorage';
import {
  deleteCredential,
  validatePasskeyNickname,
  PASSKEY_NICKNAME_MAX_LENGTH,
  type RegistrationResult,
  type Sep10SignInResult,
} from '@/lib/passkey';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'auth' | 'register' | 'wallet' | 'recovery';

type ModalState =
  | { mode: 'register' }
  | { mode: 'reauth'; credential?: StoredCredential }
  | null;

const PASSKEY_USER_KEY = 'web3sl_passkey_user_id';

/** Stable WebAuthn user handle so every key a student adds belongs to one account. */
function getOrCreatePasskeyUserId(): string {
  try {
    const existing = localStorage.getItem(PASSKEY_USER_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = `user_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem(PASSKEY_USER_KEY, id);
    return id;
  } catch {
    return `user_${Date.now()}`;
  }
}

function credentialLabel(cred: StoredCredential): string {
  return cred.nickname || cred.deviceName || 'Passkey';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PasskeyWalletPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('auth');
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [walletData, setWalletData] = useState<StoredWalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [passkeyUserId, setPasskeyUserId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setPasskeyUserId(getOrCreatePasskeyUserId());
  }, []);

  // Load stored data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const storedCredentials = await getStoredCredentials();
      const storedWalletData = await getStoredWalletData();

      setCredentials(storedCredentials);
      setWalletData(storedWalletData);

      // If user has credentials, show wallet; otherwise show auth
      if (storedCredentials.length > 0 && storedWalletData) {
        setViewMode('wallet');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /** Persist a freshly registered passkey (first key creates the wallet record). */
  const handlePasskeyRegistered = async (result: RegistrationResult & { nickname: string }) => {
    if (!result.credentialId) throw new Error('Registration returned no credential');
    const now = new Date().toISOString();
    await addCredential({
      id: result.credentialId,
      credentialId: result.credentialId,
      publicKeyX: result.publicKeyX ?? '',
      publicKeyY: result.publicKeyY ?? '',
      signCount: 0,
      nickname: result.nickname,
      deviceName: result.nickname,
      authenticatorAttachment: result.authenticatorAttachment,
      transports: result.transports,
      prfEnabled: result.prfEnabled,
      stellarPublicKey: result.stellarPublicKey,
      walletAddress: result.stellarPublicKey,
      createdAt: now,
    });

    const existingWallet = await getStoredWalletData();
    if (!existingWallet) {
      await storeWalletData({
        walletAddress: result.stellarPublicKey ?? '',
        passkeyCredentialId: result.credentialId,
        guardians: [],
        createdAt: now,
        lastActivityAt: now,
      });
    }
    await loadData();
  };

  /** Store the SEP-0010 session and link the derived Stellar account. */
  const handleSep10Authenticated = async (result: Sep10SignInResult) => {
    const auth = result.auth as { token?: string; accessToken?: string; user?: unknown } | null;
    const token = auth?.token ?? auth?.accessToken;
    if (token) {
      localStorage.setItem('token', token);
      if (auth?.user) localStorage.setItem('user', JSON.stringify(auth.user));
    }

    await updateStoredCredential(result.credentialId, {
      stellarPublicKey: result.account,
      walletAddress: result.account,
      prfEnabled: true,
      lastUsedAt: new Date().toISOString(),
    });

    const wallet = await getStoredWalletData();
    if (wallet) {
      await storeWalletData({
        ...wallet,
        walletAddress: wallet.walletAddress || result.account,
        lastActivityAt: new Date().toISOString(),
      });
    }

    setNotice(`Signed in to Stellar account ${result.account.slice(0, 6)}…${result.account.slice(-6)} via SEP-0010.`);
    await loadData();
    setViewMode('wallet');
  };

  const startRename = (cred: StoredCredential) => {
    setEditingId(cred.credentialId);
    setEditValue(credentialLabel(cred));
    setEditError(null);
  };

  const saveRename = async (cred: StoredCredential) => {
    const others = credentials
      .filter((c) => c.credentialId !== cred.credentialId)
      .map(credentialLabel);
    const problem = validatePasskeyNickname(editValue, others);
    if (problem) {
      setEditError(problem);
      return;
    }
    await renameCredential(cred.credentialId, editValue);
    setEditingId(null);
    await loadData();
  };

  const handleRemovePasskey = async (cred: StoredCredential) => {
    if (credentials.length <= 1) {
      setError('You need at least one passkey to access your wallet. Add another passkey before removing this one.');
      return;
    }
    if (!window.confirm(`Remove “${credentialLabel(cred)}”? You won't be able to sign in with it anymore.`)) {
      return;
    }
    try {
      await deleteCredential(cred.credentialId);
    } catch (err) {
      // Local removal still proceeds; the server copy is orphaned but unusable without the device.
      console.warn('Server passkey deletion failed:', err);
    }
    await removeCredential(cred.credentialId);
    setNotice(`Removed “${credentialLabel(cred)}”.`);
    await loadData();
  };

  const handleLoginSuccess = (credentialId: string) => {
    console.log('Login success:', { credentialId });
    setViewMode('wallet');
  };

  const handleRecoveryComplete = (newOwner: string) => {
    console.log('Recovery complete:', { newOwner });
    setViewMode('wallet');
  };

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all wallet data? This cannot be undone.')) {
      clearAllStoredData();
      setCredentials([]);
      setWalletData(null);
      setViewMode('auth');
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
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
              <div>
                <h1 className="text-xl font-bold text-gray-900">Passkey Wallet</h1>
                <p className="text-sm text-gray-500">
                  Secure, passwordless Web3 onboarding
                </p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-4">
              {viewMode !== 'wallet' && credentials.length > 0 && (
                <button
                  onClick={() => setViewMode('wallet')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900
                             transition-colors"
                >
                  Wallet
                </button>
              )}
              {viewMode !== 'recovery' && walletData && (
                <button
                  onClick={() => setViewMode('recovery')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900
                             transition-colors"
                >
                  Recovery
                </button>
              )}
              {viewMode !== 'auth' && viewMode !== 'register' && (
                <button
                  onClick={() => setViewMode('auth')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900
                             transition-colors"
                >
                  Sign Out
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-red-700 hover:text-red-900"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div role="status" className="mb-6 flex items-start justify-between gap-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{notice}</p>
            <button
              onClick={() => setNotice(null)}
              className="text-sm text-green-800 hover:text-green-900"
              aria-label="Dismiss message"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Auth View */}
        {viewMode === 'auth' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
              <PasskeyLogin
                onLoginSuccess={handleLoginSuccess}
                onRegisterClick={() => setViewMode('register')}
              />
            </div>
          </div>
        )}

        {/* Registration View */}
        {viewMode === 'register' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-gray-900">Create your passkey wallet</h2>
                <p className="text-gray-600">
                  Register Touch ID, Face ID, Windows Hello or a hardware security key such as a
                  YubiKey. No passwords, and your private key never leaves the authenticator.
                </p>
                <button
                  onClick={() => setModal({ mode: 'register' })}
                  disabled={!passkeyUserId}
                  className="w-full mt-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                             hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Create a passkey
                </button>
              </div>
              <div className="mt-4 text-center">
                <button
                  onClick={() => setViewMode('auth')}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Already have a passkey? Sign in
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wallet View */}
        {viewMode === 'wallet' && walletData && (
          <div className="space-y-6">
            {/* Wallet Card */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">My Wallet</h2>
                    <p className="text-blue-100 mt-1">
                      Created {new Date(walletData.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Wallet Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Wallet Address
                  </label>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 p-3 bg-gray-50 rounded-lg text-sm font-mono text-gray-900 break-all">
                      {walletData.walletAddress || 'Not linked yet — sign in with your passkey below'}
                    </code>
                    <button
                      disabled={!walletData.walletAddress}
                      onClick={() => {
                        navigator.clipboard.writeText(walletData.walletAddress);
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                      title="Copy address"
                    >
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
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* SEP-0010 sign-in */}
                <div className="p-4 bg-blue-50 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      {walletData.walletAddress
                        ? 'Sign in to Web3 Student Lab with your passkey'
                        : 'Link your Stellar account'}
                    </p>
                    <p className="text-xs text-blue-800">
                      Your passkey signs a Stellar SEP-0010 challenge, then the server issues your session.
                    </p>
                  </div>
                  <button
                    onClick={() => setModal({ mode: 'reauth' })}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Sign in with passkey
                  </button>
                </div>

                {/* Passkeys */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">
                      Registered Passkeys ({credentials.length})
                    </h3>
                    <button
                      onClick={() => setModal({ mode: 'register' })}
                      disabled={!passkeyUserId}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      + Add passkey
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {credentials.map((cred) => {
                      const isEditing = editingId === cred.credentialId;
                      const editInputId = `passkey-name-${cred.credentialId}`;
                      return (
                        <li
                          key={cred.credentialId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveRename(cred);
                                }}
                                className="space-y-1"
                              >
                                <label htmlFor={editInputId} className="sr-only">
                                  Passkey name
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    id={editInputId}
                                    value={editValue}
                                    autoFocus
                                    maxLength={PASSKEY_NICKNAME_MAX_LENGTH + 8}
                                    onChange={(e) => {
                                      setEditValue(e.target.value);
                                      setEditError(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    aria-invalid={!!editError}
                                    className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                                  />
                                  <button type="submit" className="text-sm text-blue-600 hover:text-blue-800">
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="text-sm text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {editError && (
                                  <p role="alert" className="text-xs text-red-600">
                                    {editError}
                                  </p>
                                )}
                              </form>
                            ) : (
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {credentialLabel(cred)}
                              </p>
                            )}
                            <p className="text-xs text-gray-500">
                              {cred.authenticatorAttachment === 'cross-platform'
                                ? 'Security key'
                                : cred.authenticatorAttachment === 'platform'
                                  ? 'This device'
                                  : 'Passkey'}
                              {' · '}Created {new Date(cred.createdAt).toLocaleDateString()}
                              {cred.lastUsedAt &&
                                ` · Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          {!isEditing && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {cred.stellarPublicKey ? (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                                  SEP-0010 ready
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">
                                  Active
                                </span>
                              )}
                              <button
                                onClick={() => setModal({ mode: 'reauth', credential: cred })}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => startRename(cred)}
                                className="text-xs text-gray-600 hover:text-gray-900"
                                aria-label={`Rename ${credentialLabel(cred)}`}
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => void handleRemovePasskey(cred)}
                                className="text-xs text-red-600 hover:text-red-800"
                                aria-label={`Remove ${credentialLabel(cred)}`}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Guardians */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    Recovery Guardians ({walletData.guardians.length})
                  </label>
                  {walletData.guardians.length > 0 ? (
                    <div className="space-y-2">
                      {walletData.guardians.map((guardian, index) => (
                        <div
                          key={index}
                          className="flex items-center p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <svg
                              className="w-4 h-4 text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                          </div>
                          <code className="text-sm font-mono text-gray-700">
                            {guardian.slice(0, 8)}...{guardian.slice(-8)}
                          </code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No guardians added.{' '}
                      <button
                        onClick={() => setViewMode('recovery')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Add guardians
                      </button>{' '}
                      for account recovery.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setViewMode('recovery')}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg
                                 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Manage Recovery
                    </button>
                    <button
                      onClick={handleClearData}
                      className="px-4 py-2 text-red-600 hover:text-red-800
                                 transition-colors"
                    >
                      Clear Data
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Info */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Security Features
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
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
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <h4 className="font-medium text-green-800">Biometric Auth</h4>
                  </div>
                  <p className="text-sm text-green-700">
                    Use Touch ID, Face ID, Windows Hello or a YubiKey to sign in.
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    <h4 className="font-medium text-blue-800">On-Chain Verification</h4>
                  </div>
                  <p className="text-sm text-blue-700">
                    Signatures verified by Soroban smart contracts.
                  </p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg
                      className="w-5 h-5 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <h4 className="font-medium text-purple-800">Social Recovery</h4>
                  </div>
                  <p className="text-sm text-purple-700">
                    Recover your wallet with trusted guardians.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recovery View */}
        {viewMode === 'recovery' && walletData && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <SocialRecovery
              walletAddress={walletData.walletAddress}
              isOwner={true}
              onRecoveryComplete={handleRecoveryComplete}
            />
          </div>
        )}
      </main>

      {modal?.mode === 'register' && (
        <PasskeyModal
          mode="register"
          open
          onOpenChange={(open) => !open && setModal(null)}
          userId={passkeyUserId}
          userName={`${passkeyUserId}@web3-student-lab.com`}
          userDisplayName="Web3 Student"
          existingNicknames={credentials.map(credentialLabel)}
          onRegistered={handlePasskeyRegistered}
        />
      )}

      {modal?.mode === 'reauth' && (
        <PasskeyModal
          mode="reauth"
          open
          onOpenChange={(open) => !open && setModal(null)}
          credentialId={modal.credential?.credentialId}
          credentialLabel={modal.credential ? credentialLabel(modal.credential) : undefined}
          account={modal.credential?.stellarPublicKey}
          onAuthenticated={handleSep10Authenticated}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Powered by WebAuthn & Soroban Smart Contracts
            </p>
            <div className="flex items-center space-x-4">
              <a
                href="https://webauthn.guide"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Learn More
              </a>
              <a
                href="https://soroban.stellar.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Soroban Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
