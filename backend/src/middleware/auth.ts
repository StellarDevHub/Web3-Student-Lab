import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse } from '../utils/response.js';
import { prisma } from '../db/index.js';
import { User } from '../auth/types.js';

interface AuthRequest extends Request {
  user?: User;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json(ApiResponse.error('Access token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Get student from database to ensure they still exist
    const student = await (prisma as any).student.findUnique({
      where: { id: decoded.userId || decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!student) {
      return res.status(401).json(ApiResponse.error('Invalid or inactive user'));
    }

    req.user = {
      id: student.id,
      email: student.email,
      name: `${student.firstName} ${student.lastName}`.trim() || student.email,
      role: decoded.role || 'student',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json(ApiResponse.error('Invalid token'));
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json(ApiResponse.error('Internal server error'));
  }
};

export { AuthRequest };
