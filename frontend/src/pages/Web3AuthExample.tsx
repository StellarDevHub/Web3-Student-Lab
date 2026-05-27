'use client';

import React, { useState } from 'react';
import Web3Login from '../components/Web3Login';
import { Web3AuthResponse } from '../services/web3.service';
import { User, LogOut, Shield, Key } from 'lucide-react';

export default function Web3AuthExample() {
  const [user, setUser] = useState<Web3AuthResponse['user'] | null>(null);
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  const handleLoginSuccess = (authResponse: Web3AuthResponse) => {
    setUser(authResponse.user);
    setTokens({
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
    });
  };

  const handleLoginError = (error: Error) => {
    console.error('Web3 login failed:', error);
  };

  const handleLogout = () => {
    setUser(null);
    setTokens(null);
    // Clear localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  };

  // Check for existing session on mount
  React.useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedAccessToken = localStorage.getItem('accessToken');
    const storedRefreshToken = localStorage.getItem('refreshToken');

    if (storedUser && storedAccessToken && storedRefreshToken) {
      try {
        setUser(JSON.parse(storedUser));
        setTokens({
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
        });
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        // Clear corrupted data
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center space-x-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Web3 Authentication</h1>
          </div>
          <p className="text-gray-600">Secure login using your Ethereum wallet</p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-lg">
          {user ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <User className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-gray-900">Welcome, {user.name}!</h2>
                <p className="font-mono text-sm text-gray-600">{user.email}</p>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 text-sm font-medium text-gray-900">User Information</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-600">User ID:</dt>
                    <dd className="font-mono text-gray-900">{user.id.slice(0, 8)}...</dd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-600">Email:</dt>
                    <dd className="font-mono text-gray-900">{user.email}</dd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-600">DID:</dt>
                    <dd className="font-mono text-gray-900">
                      {user.did ? `${user.did.slice(0, 8)}...` : 'Not set'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 flex items-center text-sm font-medium text-gray-900">
                  <Key className="mr-1 h-4 w-4" />
                  Authentication Tokens
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="mb-1 text-xs text-gray-600">Access Token:</p>
                    <p className="rounded bg-gray-100 p-2 font-mono text-xs break-all text-gray-900">
                      {tokens?.accessToken.slice(0, 20)}...{tokens?.accessToken.slice(-20)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-gray-600">Refresh Token:</p>
                    <p className="rounded bg-gray-100 p-2 font-mono text-xs break-all text-gray-900">
                      {tokens?.refreshToken.slice(0, 20)}...{tokens?.refreshToken.slice(-20)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center space-x-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div>
              <Web3Login onLoginSuccess={handleLoginSuccess} onLoginError={handleLoginError} />
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="mb-2 text-sm font-medium text-blue-900">How it works:</h3>
            <ol className="space-y-1 text-left text-xs text-blue-800">
              <li>1. Click "Connect Wallet" to connect your Ethereum wallet</li>
              <li>2. Request a cryptographic nonce from the server</li>
              <li>3. Sign the authentication message with your wallet</li>
              <li>4. Server verifies the signature and issues JWT tokens</li>
              <li>5. You're now authenticated and can access protected resources</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
