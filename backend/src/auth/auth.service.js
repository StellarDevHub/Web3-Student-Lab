import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/index.js';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;
/**
 * Hash a password using bcrypt
 */
export const hashPassword = async (password) => {
    return bcrypt.hash(password, SALT_ROUNDS);
};
/**
 * Compare a plain password with a hashed password
 */
export const comparePassword = async (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};
/**
 * Generate a JWT token for a user
 */
export const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
/**
 * Verify a JWT token and return the decoded payload
 */
export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
/**
 * Format a Student database record into a User response object
 */
export const formatUserResponse = (student) => {
    return {
        id: student.id,
        email: student.email,
        name: `${student.firstName} ${student.lastName}`,
    };
};
/**
 * Register a new student
 */
export const register = async (data) => {
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
export const login = async (data) => {
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
export const getStudentById = async (studentId) => {
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
export const getCurrentUser = async (token) => {
    try {
        const decoded = verifyToken(token);
        return getStudentById(decoded.userId);
    }
    catch {
        return null;
    }
};
//# sourceMappingURL=auth.service.js.map