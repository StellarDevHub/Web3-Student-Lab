import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/index.js';
import { LoginRequest, RegisterRequest, User } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;
const DID_REGEX = /^did:soroban:[A-Za-z0-9._:%-]+(?:#[A-Za-z0-9._:%-]+)?$/;

export const isValidSorobanDid = (did: string): boolean => {
  return did.length <= 256 && DID_REGEX.test(did);
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

  if (!isValidSorobanDid(trimmedDid)) {
    throw new Error('Invalid DID format. Expected did:soroban:<network>:<identifier>');
  }

  return trimmedDid;
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
 * Register a new student
 */
export const register = async (data: RegisterRequest): Promise<any> => {
  const { email, password, firstName, lastName, walletAddress } = data;

  // Check if student already exists
  const existingStudent = await prisma.student.findUnique({
    where: { email },
  });

  if (existingStudent) {
    const normalizedWalletAddress = walletAddress?.trim() || null;

    if (
      normalizedWalletAddress &&
      (!existingStudent.walletAddress || existingStudent.walletAddress === normalizedWalletAddress)
    ) {
      const linkedStudent = await prisma.student.update({
        where: { id: existingStudent.id },
        data: {
          firstName,
          lastName,
          walletAddress: normalizedWalletAddress,
        },
      });

      const payload: TokenPayload = { userId: linkedStudent.id };
      const accessToken = generateAccessToken(payload);
      const refreshToken = await generateRefreshToken(payload);

      return {
        user: formatUserResponse(linkedStudent),
        token: accessToken,
        accessToken,
        refreshToken,
      };
    }

    throw new Error('Student with this email already exists');
  }

  if (walletAddress) {
    const existingWalletStudent = await prisma.student.findUnique({
      where: { walletAddress },
    });

    if (existingWalletStudent && existingWalletStudent.email !== email) {
      throw new Error('This wallet is already linked to another profile');
    }
  }

  // Hash the password
  const hashedPassword = await hashPassword(password);

  // Create the student
  const student = await prisma.student.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      walletAddress: walletAddress || null,
    },
  });

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
