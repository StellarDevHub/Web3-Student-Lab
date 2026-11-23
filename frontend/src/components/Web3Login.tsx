'use client';

import { AlertCircle, CheckCircle, Loader2, Wallet } from 'lucide-react';
import React, { useState } from 'react';
import { Web3AuthResponse, web3AuthService } from '../services/web3.service';

// Add TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Web3LoginProps {
  onLoginSuccess?: (user: Web3AuthResponse) => void;
  onLoginError?: (error: Error) => void;
  className?: string;
}

export const Web3Login: React.FC<Web3LoginProps> = ({
  onLoginSuccess,
  onLoginError,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const handleConnectWallet = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if MetaMask is installed
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
      }

      // Get wallet address first
      const address = await web3AuthService.getWalletAddress();
      if (address) {
        setWalletAddress(address);
      }

      // Authenticate with Web3
      const authResponse = await web3AuthService.authenticate();

      setWalletAddress(authResponse.user.email); // Will show wallet address
      onLoginSuccess?.(authResponse);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      onLoginError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    web3AuthService.disconnect();
    setWalletAddress(null);
    setError(null);
  };

  // Check if already connected on mount
  React.useEffect(() => {
    const storedUser = web3AuthService.getStoredUser();
    if (storedUser) {
      setWalletAddress(storedUser.email);
    }
  }, []);

  return (
    <div className={`web3-login ${className}`}>
      {walletAddress ? (
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">Wallet Connected</p>
              <p className="font-mono text-xs text-green-700">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="flex w-full items-center justify-center space-x-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <Wallet className="h-4 w-4" />
            <span>Disconnect Wallet</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col space-y-4">
          <button
            onClick={handleConnectWallet}
            disabled={isLoading}
            className="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                <span>Connect Wallet</span>
              </>
            )}
          </button>

          {error && (
            <div className="flex items-start space-x-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="text-center text-xs text-gray-500">
            <p>Connect your Ethereum wallet to sign in securely.</p>
            <p className="mt-1">Requires MetaMask or compatible wallet.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Web3Login;
