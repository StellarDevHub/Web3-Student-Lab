import crypto from 'crypto';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import {
  generateAccessToken,
  generateRefreshToken,
  TokenPayload,
} from './token.service.js';
import { GitHubUser, GitHubAccessTokenResponse, GitHubEmail, GitHubAuthResponse } from './github.types.js';
import { formatUserResponse } from './auth.service.js';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI || 'http://localhost:8080/api/v1/oauth/github/callback';
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';
const OAUTH_STATE_EXPIRY_MINUTES = 10;

/**
 * Get GitHub OAuth configuration with validation
 */
export const getGitHubConfig = () => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
    );
  }
  return {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    redirectUri: GITHUB_REDIRECT_URI,
  };
};

/**
 * Generate a cryptographically secure random state string for CSRF protection
 */
export const generateState = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create and store an OAuth state in the database
 */
export const createOAuthState = async (workspaceId: string = 'default'): Promise<string> => {
  const rawState = generateState();
  const state = `${workspaceId}__${rawState}`;
  const expiresAt = new Date(Date.now() + OAUTH_STATE_EXPIRY_MINUTES * 60 * 1000);

  await prisma.oAuthState.create({
    data: {
      state,
      provider: 'github',
      expiresAt,
    },
  });

  return state;
};

/**
 * Validate an OAuth state from the database
 * Returns true if valid, false if invalid/expired
 */
export const validateOAuthState = async (state: string): Promise<boolean> => {
  try {
    const storedState = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!storedState) {
      logger.warn(`OAuth state not found: ${state.substring(0, 8)}...`);
      return false;
    }

    if (storedState.usedAt) {
      logger.warn(`OAuth state already used: ${state.substring(0, 8)}...`);
      return false;
    }

    if (storedState.expiresAt < new Date()) {
      logger.warn(`OAuth state expired: ${state.substring(0, 8)}...`);
      return false;
    }

    // Mark state as used (prevent replay attacks)
    await prisma.oAuthState.update({
      where: { id: storedState.id },
      data: { usedAt: new Date() },
    });

    return true;
  } catch (error) {
    logger.error('Error validating OAuth state:', error);
    return false;
  }
};

/**
 * Build the GitHub OAuth authorization URL
 * Throws if GitHub OAuth is not configured
 */
export const buildAuthorizationUrl = (state: string): string => {
  // Validate configuration before building URL
  getGitHubConfig();

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'read:user user:email',
    state,
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
};

/**
 * Exchange an authorization code for an access token from GitHub
 */
export const exchangeCodeForToken = async (
  code: string
): Promise<GitHubAccessTokenResponse> => {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('GitHub token exchange failed:', { status: response.status, body: errorBody });
    throw new Error(`GitHub token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as GitHubAccessTokenResponse;

  if ((data as any).error) {
    logger.error('GitHub OAuth error:', (data as any).error_description || (data as any).error);
    throw new Error(`GitHub OAuth error: ${(data as any).error_description || (data as any).error}`);
  }

  return data;
};

/**
 * Fetch the authenticated user's GitHub profile
 */
export const fetchGitHubUser = async (
  accessToken: string
): Promise<GitHubUser> => {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Web3-Student-Lab',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('GitHub API user fetch failed:', { status: response.status, body: errorBody });
    throw new Error(`Failed to fetch GitHub user: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
};

/**
 * Fetch the primary email from GitHub for the authenticated user
 */
export const fetchGitHubPrimaryEmail = async (
  accessToken: string
): Promise<string | null> => {
  try {
    const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Web3-Student-Lab',
      },
    });

    if (!response.ok) {
      return null;
    }

    const emails = (await response.json()) as GitHubEmail[];
    const primaryEmail = emails.find((e) => e.primary && e.verified);
    return primaryEmail?.email || null;
  } catch (error) {
    logger.warn('Failed to fetch GitHub emails:', error);
    return null;
  }
};

/**
 * Find or create a student account linked to a GitHub account
 */
export const findOrCreateStudentByGitHub = async (
  githubUser: GitHubUser,
  githubAccessToken: string
): Promise<{ student: any; isNewUser: boolean }> => {
  // Check if a student already exists with this GitHub ID
  let student = await prisma.student.findUnique({
    where: { githubId: githubUser.id },
  });

  if (student) {
    // Update existing GitHub-linked account
    student = await prisma.student.update({
      where: { id: student.id },
      data: {
        githubUsername: githubUser.login,
        githubAvatarUrl: githubUser.avatar_url,
        githubAccessToken,
        updatedAt: new Date(),
      },
    });

    return { student, isNewUser: false };
  }

  // Try to find by email from GitHub
  const email = githubUser.email || (await fetchGitHubPrimaryEmail(githubAccessToken));

  if (email) {
    student = await prisma.student.findUnique({
      where: { email },
    });

    if (student) {
      // Link GitHub account to existing student
      student = await prisma.student.update({
        where: { id: student.id },
        data: {
          githubId: githubUser.id,
          githubUsername: githubUser.login,
          githubAvatarUrl: githubUser.avatar_url,
          githubAccessToken,
          updatedAt: new Date(),
        },
      });

      return { student, isNewUser: false };
    }
  }

  // Create a new student account from GitHub profile
  const displayName = githubUser.name || githubUser.login;
  const nameParts = displayName.split(' ');
  const firstName = nameParts[0] || 'GitHub';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  // Generate a placeholder email if GitHub doesn't provide one
  const studentEmail = email || `${githubUser.login}@github.oauth`;

  // Generate a random password for OAuth-created accounts
  const randomPassword = crypto.randomBytes(32).toString('hex');

  student = await prisma.student.create({
    data: {
      email: studentEmail,
      password: randomPassword,
      firstName,
      lastName,
      githubId: githubUser.id,
      githubUsername: githubUser.login,
      githubAvatarUrl: githubUser.avatar_url,
      // TODO: Encrypt the GitHub access token before storing in production
      githubAccessToken,
    },
  });

  return { student, isNewUser: true };
};

/**
 * Complete GitHub OAuth login flow
 * Orchestrates: state validation -> code exchange -> profile fetch -> account find/create -> token generation
 */
export const handleGitHubCallback = async (
  code: string,
  state: string
): Promise<GitHubAuthResponse> => {
  // Validate state for CSRF protection
  const isValidState = await validateOAuthState(state);
  if (!isValidState) {
    throw new Error('Invalid or expired OAuth state. Please try logging in again.');
  }

  // Exchange authorization code for access token
  const tokenResponse = await exchangeCodeForToken(code);

  // Fetch GitHub user profile
  const githubUser = await fetchGitHubUser(tokenResponse.access_token);

  // Find or create student account
  const { student, isNewUser } = await findOrCreateStudentByGitHub(
    githubUser,
    tokenResponse.access_token
  );

  // Generate JWT tokens
  const payload: TokenPayload = { userId: student.id };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    user: {
      id: student.id,
      email: student.email,
      name: `${student.firstName} ${student.lastName}`,
      githubId: student.githubId,
      githubUsername: student.githubUsername,
      githubAvatarUrl: student.githubAvatarUrl,
    },
    token: accessToken,
    accessToken,
    refreshToken,
    isNewUser,
  };
};

/**
 * Link a GitHub account to an existing authenticated student
 */
export const linkGitHubAccount = async (
  studentId: string,
  code: string
): Promise<GitHubAuthResponse> => {
  // Exchange code for token (no state validation needed for linking)
  const tokenResponse = await exchangeCodeForToken(code);

  // Fetch GitHub user profile
  const githubUser = await fetchGitHubUser(tokenResponse.access_token);

  // Check if GitHub account is already linked to another student
  const existingStudent = await prisma.student.findUnique({
    where: { githubId: githubUser.id },
  });

  if (existingStudent && existingStudent.id !== studentId) {
    throw new Error('This GitHub account is already linked to another profile');
  }

  // Link GitHub to the student
  const student = await prisma.student.update({
    where: { id: studentId },
    data: {
      githubId: githubUser.id,
      githubUsername: githubUser.login,
      githubAvatarUrl: githubUser.avatar_url,
      // TODO: Encrypt the GitHub access token before storing in production
      // The project has encryptPayload/decryptionMiddleware utilities
      githubAccessToken: tokenResponse.access_token,
      updatedAt: new Date(),
    },
  });

  const payload: TokenPayload = { userId: student.id };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    user: {
      id: student.id,
      email: student.email,
      name: `${student.firstName} ${student.lastName}`,
      githubId: student.githubId!,
      githubUsername: student.githubUsername!,
      githubAvatarUrl: student.githubAvatarUrl,
    },
    token: accessToken,
    accessToken,
    refreshToken,
    isNewUser: false,
  };
};

/**
 * Clean up expired OAuth states (should be run periodically)
 */
export const cleanupExpiredOAuthStates = async (): Promise<void> => {
  await prisma.oAuthState.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
};
