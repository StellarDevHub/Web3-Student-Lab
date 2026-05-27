import { ethers } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';

export interface Web3AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    did?: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

export interface NonceResponse {
  nonce: string;
  expiresAt: string;
}

export class Web3AuthService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  /**
   * Initialize Web3 provider and signer
   */
  async initialize(): Promise<boolean> {
    try {
      const ethereumProvider = await detectEthereumProvider();

      if (!ethereumProvider) {
        throw new Error('MetaMask is not installed');
      }

      this.provider = new ethers.BrowserProvider(ethereumProvider as any);

      // Request account access
      await this.provider.send('eth_requestAccounts', []);

      this.signer = await this.provider.getSigner();
      return true;
    } catch (error) {
      console.error('Failed to initialize Web3:', error);
      return false;
    }
  }

  /**
   * Get the current wallet address
   */
  async getWalletAddress(): Promise<string | null> {
    try {
      if (!this.signer) {
        await this.initialize();
      }

      if (!this.signer) {
        return null;
      }

      return await this.signer.getAddress();
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return null;
    }
  }

  /**
   * Request a nonce from the backend
   */
  async requestNonce(walletAddress: string): Promise<NonceResponse> {
    const response = await fetch(
      `/api/auth/nonce?walletAddress=${encodeURIComponent(walletAddress)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get nonce');
    }

    return response.json();
  }

  /**
   * Sign a message with the current wallet
   */
  async signMessage(message: string): Promise<string> {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected');
      }

      return await this.signer.signMessage(message);
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message');
    }
  }

  /**
   * Authenticate with Web3 wallet
   */
  async authenticate(): Promise<Web3AuthResponse> {
    try {
      // Initialize and get wallet address
      const isInitialized = await this.initialize();
      if (!isInitialized) {
        throw new Error('Failed to initialize wallet');
      }

      const walletAddress = await this.getWalletAddress();
      if (!walletAddress) {
        throw new Error('No wallet address found');
      }

      // Request nonce
      const { nonce } = await this.requestNonce(walletAddress);

      // Construct message to sign
      const message = `Sign this message to authenticate with Web3 Student Lab. Nonce: ${nonce}`;

      // Sign the message
      const signature = await this.signMessage(message);

      // Verify signature with backend
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          signature,
          nonce,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const authResponse = await response.json();

      // Store tokens in localStorage
      localStorage.setItem('accessToken', authResponse.accessToken);
      localStorage.setItem('refreshToken', authResponse.refreshToken);
      localStorage.setItem('user', JSON.stringify(authResponse.user));

      return authResponse;
    } catch (error) {
      console.error('Web3 authentication failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.provider = null;
    this.signer = null;

    // Clear stored tokens
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.provider !== null && this.signer !== null;
  }

  /**
   * Get stored user data
   */
  getStoredUser(): any {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * Get stored access token
   */
  getStoredAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  /**
   * Get stored refresh token
   */
  getStoredRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }
}

// Export singleton instance
export const web3AuthService = new Web3AuthService();
