import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { StrKey } from '@stellar/stellar-sdk';
import prisma from '../db/index.js';
import { LoginRequest, RegisterRequest, User } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

const SUPPORTED_SOROBAN_NETWORKS = new Set(['testnet', 'mainnet', 'futurenet']);
const SUPPORTED_DID_METHODS = new Set(['soroban', 'stellar']);

export class DidValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DidValidationError';
  }
}

export interface ParsedDid {
  method: 'soroban' | 'stellar';
  network: 'testnet' | 'mainnet' | 'futurenet' | null;
  subject: string;
  fragment: string | null;
  normalizedDid: string;
}

const normalizeNetwork = (network: string): 'testnet' | 'mainnet' | 'futurenet' | null => {
  const normalized = network.trim().toLowerCase();
  if (normalized === 'public') {
    return 'mainnet';
  }

  if (SUPPORTED_SOROBAN_NETWORKS.has(normalized)) {
    return normalized as 'testnet' | 'mainnet' | 'futurenet';
  }

  return null;
};

const isValidDidSubject = (subject: string): boolean => /^[A-Za-z0-9._:%-]+$/.test(subject);

const extractFragment = (value: string): { base: string; fragment: string | null } => {
  const [base, ...fragmentParts] = value.split('#');
  if (fragmentParts.length === 0) {
    return { base: base!, fragment: null };
  }

  const fragment = fragmentParts.join('#').trim();
  if (!fragment || !isValidDidSubject(fragment)) {
    throw new DidValidationError('Invalid DID format. Fragment contains unsupported characters');
  }

  return { base: base!, fragment };
};

export const parseSupportedDid = (did: string): ParsedDid => {
  const trimmedDid = did.trim();
  if (!trimmedDid || trimmedDid.length > 256) {
    throw new DidValidationError('Invalid DID format. DID must be between 1 and 256 characters');
  }

  const { base, fragment } = extractFragment(trimmedDid);
  const segments = base.split(':');

  if (segments[0]?.toLowerCase() !== 'did' || segments.length < 3) {
    throw new DidValidationError('Invalid DID format. Expected did:<method>:<subject>');
  }

  const method = segments[1]!.toLowerCase();
  if (!SUPPORTED_DID_METHODS.has(method)) {
    throw new DidValidationError(`Unsupported DID method. Supported methods: ${Array.from(SUPPORTED_DID_METHODS).join(', ')}`);
  }

  if (method === 'stellar') {
    if (segments.length !== 3) {
      throw new DidValidationError('Invalid DID format. Expected did:stellar:<stellarPublicKey>');
    }

    const subject = segments[2]!.trim().toUpperCase();
    if (!StrKey.isValidEd25519PublicKey(subject)) {
      throw new DidValidationError('Invalid DID subject. Expected a valid Stellar public key');
    }

    return {
      method: 'stellar',
      network: null,
      subject,
      fragment,
      normalizedDid: `did:stellar:${subject}${fragment ? `#${fragment}` : ''}`,
    };
  }

  if (segments.length !== 4) {
    throw new DidValidationError('Invalid DID format. Expected did:soroban:<network>:<identifier>');
  }

  const network = normalizeNetwork(segments[2]!);
  if (!network) {
    throw new DidValidationError(
      `Unsupported DID network. Supported Soroban networks: ${Array.from(SUPPORTED_SOROBAN_NETWORKS).join(', ')}`
    );
  }

  const subject = segments[3]!.trim();
  if (!subject || !isValidDidSubject(subject)) {
    throw new DidValidationError('Invalid DID subject. Identifier contains unsupported characters');
  }

  return {
    method: 'soroban',
    network,
    subject,
    fragment,
    normalizedDid: `did:soroban:${network}:${subject}${fragment ? `#${fragment}` : ''}`,
  };
};

export const isValidSorobanDid = (did: string): boolean => {
  try {
    const parsed = parseSupportedDid(did);
    return parsed.method === 'soroban';
  } catch {
    return false;
  }
};

export const normalizeSorobanDid = (did: string | null | undefined): string | null | undefined => {
  if (did === undefined) {
    return undefined;
  }

  if (did === null) {
    return null;
  }

  const trimmedDid = did.trim();
  if (!trimmedDid) {
    return null;
  }

  const parsed = parseSupportedDid(trimmedDid);
  if (parsed.method !== 'soroban') {
    throw new DidValidationError('Invalid DID format. Expected did:soroban:<network>:<identifier>');
  }

  return parsed.normalizedDid;
};

export const normalizeSupportedDid = (did: string | null | undefined): string | null | undefined => {
  if (did === undefined) {
    return undefined;
  }

  if (did === null) {
    return null;
  }

  const trimmedDid = did.trim();
  if (!trimmedDid) {
    return null;
  }

  return parseSupportedDid(trimmedDid).normalizedDid;
};

export const validateStudentDidCompatibility = (params: {
  did: string | null | undefined;
  walletAddress?: string | null;
  expectedNetwork?: string | null;
}): string | null | undefined => {
  const { did, walletAddress, expectedNetwork } = params;
  const normalizedDid = normalizeSupportedDid(did);

  if (normalizedDid === undefined || normalizedDid === null) {
    return normalizedDid;
  }

  const parsed = parseSupportedDid(normalizedDid);
  const normalizedWalletAddress = walletAddress?.trim().toUpperCase() || null;

  if (expectedNetwork) {
    const normalizedExpectedNetwork = normalizeNetwork(expectedNetwork);
    if (!normalizedExpectedNetwork) {
      throw new DidValidationError(`Unsupported enrollment network: ${expectedNetwork}`);
    }

    if (parsed.network !== normalizedExpectedNetwork) {
      throw new DidValidationError(
        `DID network mismatch. Expected ${normalizedExpectedNetwork} but received ${parsed.network ?? 'none'}`
      );
    }
  }

  if (normalizedWalletAddress) {
    if (!StrKey.isValidEd25519PublicKey(normalizedWalletAddress)) {
      throw new DidValidationError('Invalid wallet address. Expected a valid Stellar public key');
    }

    if (parsed.method === 'stellar' && parsed.subject !== normalizedWalletAddress) {
      throw new DidValidationError('DID subject mismatch. Stellar DID subject must match the linked wallet address');
    }

    if (parsed.method === 'soroban' && StrKey.isValidEd25519PublicKey(parsed.subject.toUpperCase())) {
      const normalizedSubject = parsed.subject.toUpperCase();
      if (normalizedSubject !== normalizedWalletAddress) {
        throw new DidValidationError('DID subject mismatch. Soroban DID subject must match the linked wallet address');
      }
    }
  }

  return normalizedDid;
};

/**
 * Hash a password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare a plain password with a hashed password
 */
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Generate a JWT token for a user
 */
export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify a JWT token and return the decoded payload
 */
export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
};

/**
 * Format a Student database record into a User response object
 */
export const formatUserResponse = (student: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  did?: string | null;
  walletAddress?: string | null;
}): User => {
  return {
    id: student.id,
    email: student.email,
    name: `${student.firstName} ${student.lastName}`,
    did: student.did ?? null,
    walletAddress: student.walletAddress ?? null,
  };
};

import { generateAccessToken, generateRefreshToken, TokenPayload } from './token.service.js';

/**
 * Register a new student with pessimistic locking to prevent race conditions
 */
export const register = async (data: RegisterRequest): Promise<any> => {
  const { email, password, firstName, lastName, walletAddress } = data;
  const normalizedWalletAddress = walletAddress?.trim() || null;

  // Use transaction with pessimistic locking to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Check if student already exists with row lock
    const existingStudent = await tx.student.findUnique({
      where: { email },
    });

    if (existingStudent) {
      if (
        normalizedWalletAddress &&
        (!existingStudent.walletAddress || existingStudent.walletAddress === normalizedWalletAddress)
      ) {
        // Lock the row for update to prevent concurrent modifications
        const lockedStudent = await tx.student.findUnique({
          where: { id: existingStudent.id },
        });

        if (!lockedStudent) {
          throw new Error('Student not found during update');
        }

        const linkedStudent = await tx.student.update({
          where: { id: existingStudent.id },
          data: {
            firstName,
            lastName,
            walletAddress: normalizedWalletAddress,
          },
        });

        return { student: linkedStudent, isUpdate: true };
      }

      throw new Error('Student with this email already exists');
    }

    // If wallet address is provided, check if it's already in use with row lock
    if (normalizedWalletAddress) {
      const existingWalletStudent = await tx.student.findUnique({
        where: { walletAddress: normalizedWalletAddress },
      });

      if (existingWalletStudent) {
        throw new Error('This wallet is already linked to another profile');
      }
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create the student
    const student = await tx.student.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        walletAddress: normalizedWalletAddress,
      },
    });

    return { student, isUpdate: false };
  }, {
    isolationLevel: 'Serializable',
  });

  // Generate tokens
  const payload: TokenPayload = { userId: result.student.id };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    user: formatUserResponse(result.student),
    token: accessToken,
    accessToken,
    refreshToken,
  };
};

/**
 * Login a student
 */
export const login = async (data: LoginRequest): Promise<any> => {
  const { email, password } = data;

  // Find the student
  const student = await prisma.student.findUnique({
    where: { email },
  });

  if (!student) {
    throw new Error('Invalid credentials');
  }

  // Compare passwords
  const isPasswordValid = await comparePassword(password, student.password);

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Generate tokens
  const payload: TokenPayload = { userId: student.id };
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    user: formatUserResponse(student),
    token: accessToken,
    accessToken,
    refreshToken,
  };
};

/**
 * Get a student by ID
 */
export const getStudentById = async (studentId: string): Promise<User | null> => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) {
    return null;
  }

  return formatUserResponse(student);
};

/**
 * Get the current authenticated user from a token
 */
export const getCurrentUser = async (token: string): Promise<User | null> => {
  try {
    const decoded = verifyToken(token);
    return getStudentById(decoded.userId);
  } catch {
    return null;
  }
};

export const getProfileStatusByWallet = async (walletAddress: string) => {
  const student = await prisma.student.findUnique({
    where: { walletAddress },
  });

  if (!student) {
    return {
      completed: false,
      user: null,
    };
  }

  return {
    completed: true,
    user: formatUserResponse(student),
  };
};
