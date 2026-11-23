/**
 * SocialRecovery Component
 *
 * React component for managing social guardian recovery.
 * This component handles:
 * 1. Adding and removing guardians
 * 2. Proposing recovery (guardian-initiated)
 * 3. Voting on recovery proposals
 * 4. Executing recovery when threshold is met
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { getStoredWalletData, StoredWalletData } from '@/lib/credentialStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Guardian {
  address: string;
  addedAt: string;
  name?: string;
}

interface RecoveryProposal {
  newOwner: string;
  votes: string[];
  proposedAt: string;
  expiresAt: string;
  status: 'active' | 'executed' | 'expired';
}

interface SocialRecoveryProps {
  walletAddress: string;
  isOwner: boolean;
  onRecoveryComplete?: (newOwner: string) => void;
}

type RecoveryStep =
  | 'loading'
  | 'manage-guardians'
  | 'propose-recovery'
  | 'vote-recovery'
  | 'execute-recovery'
  | 'complete';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SocialRecovery({
  walletAddress,
  isOwner,
  onRecoveryComplete,
}: SocialRecoveryProps) {
  const [step, setStep] = useState<RecoveryStep>('loading');
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [proposal, setProposal] = useState<RecoveryProposal | null>(null);
  const [newGuardianAddress, setNewGuardianAddress] = useState('');
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load guardians on mount
  useEffect(() => {
    loadGuardians();
  }, [walletAddress]);

  const loadGuardians = async () => {
    try {
      setStep('loading');
      // In production, this would query the Soroban contract
      // For now, we simulate loading from local storage
      const walletData = await getStoredWalletData();
      if (walletData?.guardians) {
        const loadedGuardians: Guardian[] = walletData.guardians.map((addr) => ({
          address: addr,
          addedAt: new Date().toISOString(),
        }));
        setGuardians(loadedGuardians);
      }
      setStep('manage-guardians');
    } catch (err) {
      console.error('Failed to load guardians:', err);
      setError('Failed to load guardians');
      setStep('manage-guardians');
    }
  };

  // -------------------------------------------------------------------------
  // Guardian Management
  // -------------------------------------------------------------------------

  const handleAddGuardian = useCallback(async () => {
    if (!newGuardianAddress) return;

    setLoading(true);
    setError(null);

    try {
      // Validate Stellar address format
      if (!newGuardianAddress.startsWith('G') || newGuardianAddress.length !== 56) {
        throw new Error('Invalid Stellar address format');
      }

      // Check for duplicate
      if (guardians.some((g) => g.address === newGuardianAddress)) {
        throw new Error('Guardian already added');
      }

      // Check limit
      if (guardians.length >= 10) {
        throw new Error('Maximum 10 guardians allowed');
      }

      // In production, this would call the Soroban contract
      const newGuardian: Guardian = {
        address: newGuardianAddress,
        addedAt: new Date().toISOString(),
      };

      setGuardians([...guardians, newGuardian]);
      setNewGuardianAddress('');
      setSuccess('Guardian added successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [newGuardianAddress, guardians]);

  const handleRemoveGuardian = useCallback(
    async (address: string) => {
      setLoading(true);
      setError(null);

      try {
        // In production, this would call the Soroban contract
        setGuardians(guardians.filter((g) => g.address !== address));
        setSuccess('Guardian removed successfully');

        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [guardians]
  );

  // -------------------------------------------------------------------------
  // Recovery Flow
  // -------------------------------------------------------------------------

  const handleProposeRecovery = useCallback(async () => {
    if (!newOwnerAddress) return;

    setLoading(true);
    setError(null);

    try {
      // Validate Stellar address format
      if (!newOwnerAddress.startsWith('G') || newOwnerAddress.length !== 56) {
        throw new Error('Invalid Stellar address format');
      }

      // In production, this would call the Soroban contract
      const newProposal: RecoveryProposal = {
        newOwner: newOwnerAddress,
        votes: [], // Guardian would add their own vote
        proposedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        status: 'active',
      };

      setProposal(newProposal);
      setStep('vote-recovery');
      setSuccess('Recovery proposal created');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [newOwnerAddress]);

  const handleVoteRecovery = useCallback(async () => {
    if (!proposal) return;

    setLoading(true);
    setError(null);

    try {
      // In production, this would call the Soroban contract
      // For now, simulate adding a vote
      const guardianAddress = 'G...'; // Would be the current guardian's address

      const updatedProposal = {
        ...proposal,
        votes: [...proposal.votes, guardianAddress],
      };

      setProposal(updatedProposal);

      // Check if threshold is met
      const threshold = Math.ceil((guardians.length * 2) / 3);
      if (updatedProposal.votes.length >= threshold) {
        setStep('execute-recovery');
        setSuccess('Threshold met! Recovery can be executed.');

        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [proposal, guardians]);

  const handleExecuteRecovery = useCallback(async () => {
    if (!proposal) return;

    setLoading(true);
    setError(null);

    try {
      // In production, this would call the Soroban contract
      setProposal({
        ...proposal,
        status: 'executed',
      });

      setStep('complete');
      onRecoveryComplete?.(proposal.newOwner);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [proposal, onRecoveryComplete]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        <p className="text-gray-600">Loading guardians...</p>
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
        <h3 className="text-lg font-semibold text-gray-900">Recovery Complete!</h3>
        <p className="text-gray-600 text-center max-w-md">
          The wallet owner has been successfully changed.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Social Recovery</h2>
        <p className="text-gray-600 mt-2">
          Manage guardians and recover your wallet if your passkey is lost.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Guardian Management */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Guardians</h3>
        <p className="text-gray-600 text-sm">
          Guardians are trusted peers who can help you recover your wallet.
          A {Math.ceil((guardians.length * 2) / 3)} out of {guardians.length} majority is required for recovery.
        </p>

        {/* Guardian List */}
        {guardians.length > 0 ? (
          <div className="space-y-3">
            {guardians.map((guardian) => (
              <div
                key={guardian.address}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-mono text-sm text-gray-900">
                    {guardian.address.slice(0, 8)}...{guardian.address.slice(-8)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Added {new Date(guardian.addedAt).toLocaleDateString()}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleRemoveGuardian(guardian.address)}
                    disabled={loading}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-800
                               disabled:opacity-50 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No guardians added yet.</p>
            <p className="text-sm mt-2">
              Add trusted peers to enable account recovery.
            </p>
          </div>
        )}

        {/* Add Guardian */}
        {isOwner && (
          <div className="flex space-x-2">
            <input
              type="text"
              value={newGuardianAddress}
              onChange={(e) => setNewGuardianAddress(e.target.value)}
              placeholder="Enter Stellar address (G...)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={handleAddGuardian}
              disabled={loading || !newGuardianAddress}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Add Guardian
            </button>
          </div>
        )}
      </div>

      {/* Recovery Flow */}
      {guardians.length >= 2 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Recovery</h3>
          <p className="text-gray-600 text-sm">
            If your passkey is lost, guardians can propose a new owner for your wallet.
          </p>

          {step === 'manage-guardians' && isOwner && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Propose New Owner
                </label>
                <input
                  type="text"
                  value={newOwnerAddress}
                  onChange={(e) => setNewOwnerAddress(e.target.value)}
                  placeholder="Enter new owner's Stellar address (G...)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <button
                onClick={handleProposeRecovery}
                disabled={loading || !newOwnerAddress}
                className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg
                           hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                Propose Recovery
              </button>
            </div>
          )}

          {step === 'vote-recovery' && proposal && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">Recovery Proposal Active</p>
                <p className="text-yellow-700 text-sm mt-1">
                  New owner: {proposal.newOwner.slice(0, 8)}...{proposal.newOwner.slice(-8)}
                </p>
                <p className="text-yellow-700 text-sm">
                  Votes: {proposal.votes.length} / {Math.ceil((guardians.length * 2) / 3)} required
                </p>
                <p className="text-yellow-700 text-sm">
                  Expires: {new Date(proposal.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleVoteRecovery}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg
                             hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Vote for Recovery
                </button>
                <button
                  onClick={() => setStep('manage-guardians')}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 rounded-lg
                             hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'execute-recovery' && proposal && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">Threshold Reached!</p>
                <p className="text-green-700 text-sm mt-1">
                  Recovery can now be executed to transfer ownership.
                </p>
              </div>

              <button
                onClick={handleExecuteRecovery}
                disabled={loading}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg
                           hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Execute Recovery
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800">How Social Recovery Works</h4>
        <ul className="text-sm text-blue-700 mt-2 space-y-1">
          <li>• Add 2+ trusted guardians (friends, family, or other devices)</li>
          <li>• If your passkey is lost, guardians can propose a new owner</li>
          <li>• A 2/3 majority of guardians must approve the recovery</li>
          <li>• Once approved, the wallet owner is changed to the new address</li>
          <li>• Your funds remain safe throughout the process</li>
        </ul>
      </div>
    </div>
  );
}

export default SocialRecovery;
