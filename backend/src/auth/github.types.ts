export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
  node_id: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface GitHubAccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubOAuthState {
  id: string;
  state: string;
  provider: string;
  redirectUri: string | null;
  expiresAt: Date;
  createdAt: Date;
  usedAt: Date | null;
}

export interface GitHubAuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    githubId: number;
    githubUsername: string;
    githubAvatarUrl: string | null;
    did?: string | null;
    walletAddress?: string | null;
  };
  token: string;
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

export interface GitHubOAuthError {
  error: string;
  error_description?: string;
}
