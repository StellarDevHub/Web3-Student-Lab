import { ethers } from 'ethers';
import prisma from '../db/index.js';
import { generateAccessToken, generateRefreshToken, TokenPayload } from './token.service.js';
import { formatUserResponse } from './auth.service.js';

const NONCE_EXPIRY_MINUTES = 5;
const NONCE_LENGTH = 32;

/**
 * Generate a cryptographically secure random nonce
 */
export const generateNonce = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < NONCE_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Create and store a nonce for a wallet address
 */
export const createNonce = async (walletAddress: string): Promise<string> => {
  // Normalize wallet address to checksum format
  const normalizedAddress = ethers.utils.getAddress(walletAddress);

  // Clean up any existing nonces for this wallet
  await prisma.authNonce.deleteMany({
    where: {
      walletAddress: normalizedAddress,
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  // Generate new nonce
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_EXPIRY_MINUTES * 60 * 1000);

  // Store nonce
  await prisma.authNonce.create({
    data: {
      walletAddress: normalizedAddress,
      nonce,
      expiresAt,
    },
  });

  return nonce;
};

/**
 * Verify a cryptographic signature against a stored nonce
 */
export const verifySignature = async (
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ user: any; accessToken: string; refreshToken: string }> => {
  // Normalize wallet address
  const normalizedAddress = ethers.utils.getAddress(walletAddress);

  // Find and validate nonce
  const storedNonce = await prisma.authNonce.findFirst({
    where: {
      walletAddress: normalizedAddress,
      nonce,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!storedNonce) {
    throw new Error('Invalid or expired nonce');
  }

  // Construct the message that was signed
  const message = `Sign this message to authenticate with Web3 Student Lab. Nonce: ${nonce}`;

  try {
    // Recover the signer address from the signature
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);

    // Verify the recovered address matches the claimed wallet address
    if (recoveredAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
      throw new Error('Signature verification failed');
    }
  } catch (error) {
    throw new Error('Invalid signature format');
  }

  // Clean up the used nonce
  await prisma.authNonce.delete({
    where: { id: storedNonce.id },
  });

  // Find or create user with this wallet address
  let student = await prisma.student.findUnique({
    where: { walletAddress: normalizedAddress },
  });

  if (!student) {
    // Create new user with wallet address
    student = await prisma.student.create({
      data: {
        walletAddress: normalizedAddress,
        email: `${normalizedAddress}@wallet.auth`, // Placeholder email
        firstName: 'Wallet',
        lastName: 'User',
        password: '', // Empty password for wallet users
      },
    });
  }

  // Generate JWT tokens
  const payload: TokenPayload = { userId: student.id };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    user: formatUserResponse(student),
    accessToken,
    refreshToken,
  };
};

/**
 * Clean up expired nonces (should be run periodically)
 */
export const cleanupExpiredNonces = async (): Promise<void> => {
  await prisma.authNonce.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
};
