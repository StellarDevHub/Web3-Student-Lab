import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/index.js';
import { RegisterRequest, LoginRequest, AuthResponse, User } from './types.js';

const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

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
}): User => {
  return {
    id: student.id,
    email: student.email,
    name: `${student.firstName} ${student.lastName}`,
  };
};

/**
 * Register a new student
 */
export const register = async (
  data: RegisterRequest
): Promise<AuthResponse> => {
  const { email, password, firstName, lastName } = data;

  // Check if student already exists
  const existingStudent = await prisma.student.findUnique({
    where: { email },
  });

  if (existingStudent) {
    throw new Error('Student with this email already exists');
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
    },
  });

  // Generate token
  const token = generateToken(student.id);

  return {
    user: formatUserResponse(student),
    token,
  };
};

/**
 * Login a student
 */
export const login = async (data: LoginRequest): Promise<AuthResponse> => {
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

  // Generate token
  const token = generateToken(student.id);

  return {
    user: formatUserResponse(student),
    token,
  };
};

/**
 * Get a student by ID
 */
export const getStudentById = async (
  studentId: string
): Promise<User | null> => {
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
