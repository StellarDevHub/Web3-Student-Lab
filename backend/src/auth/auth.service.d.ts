import { RegisterRequest, LoginRequest, AuthResponse, User } from './types.js';
/**
 * Hash a password using bcrypt
 */
export declare const hashPassword: (password: string) => Promise<string>;
/**
 * Compare a plain password with a hashed password
 */
export declare const comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
/**
 * Generate a JWT token for a user
 */
export declare const generateToken: (userId: string) => string;
/**
 * Verify a JWT token and return the decoded payload
 */
export declare const verifyToken: (token: string) => {
    userId: string;
};
/**
 * Format a Student database record into a User response object
 */
export declare const formatUserResponse: (student: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
}) => User;
/**
 * Register a new student
 */
export declare const register: (data: RegisterRequest) => Promise<AuthResponse>;
/**
 * Login a student
 */
export declare const login: (data: LoginRequest) => Promise<AuthResponse>;
/**
 * Get a student by ID
 */
export declare const getStudentById: (studentId: string) => Promise<User | null>;
/**
 * Get the current authenticated user from a token
 */
export declare const getCurrentUser: (token: string) => Promise<User | null>;
//# sourceMappingURL=auth.service.d.ts.map