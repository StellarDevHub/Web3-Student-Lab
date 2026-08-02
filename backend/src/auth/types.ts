export interface User {
  id: string;
  email: string;
  name: string;
  did?: string | null;
  walletAddress?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  walletAddress?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Web3NonceRequest {
  walletAddress: string;
}

export interface Web3NonceResponse {
  nonce: string;
  expiresAt: string;
}

export interface Web3VerifyRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
}

export interface Web3AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
