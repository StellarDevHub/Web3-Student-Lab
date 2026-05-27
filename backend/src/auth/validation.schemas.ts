import { z } from 'zod';

/**
 * User Registration Schema
 * Validates the request body for user registration
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email format').min(1, 'Email is required'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be less than 100 characters'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .regex(
      /^[a-zA-Z\s'-]+$/,
      'First name can only contain letters, spaces, hyphens, and apostrophes'
    ),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .regex(
      /^[a-zA-Z\s'-]+$/,
      'Last name can only contain letters, spaces, hyphens, and apostrophes'
    ),
  walletAddress: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar wallet address format')
    .optional(),
});

/**
 * User Login Schema
 * Validates the request body for user login
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email format').min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Web3 Nonce Request Schema
 * Validates the request body for nonce generation
 */
export const web3NonceSchema = z.object({
  walletAddress: z
    .string()
    .min(1, 'Wallet address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address format'),
});

/**
 * Web3 Verify Request Schema
 * Validates the request body for signature verification
 */
export const web3VerifySchema = z.object({
  walletAddress: z
    .string()
    .min(1, 'Wallet address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address format'),
  signature: z
    .string()
    .min(1, 'Signature is required')
    .regex(/^0x[a-fA-F0-9]{130,132}$/, 'Invalid signature format'),
  nonce: z.string().min(1, 'Nonce is required').min(32, 'Invalid nonce length'),
});

/**
 * Type inference for validated data
 */
export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type Web3NonceRequest = z.infer<typeof web3NonceSchema>;
export type Web3VerifyRequest = z.infer<typeof web3VerifySchema>;
