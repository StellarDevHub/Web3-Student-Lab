import { Socket } from 'socket.io';
import { verifyToken, getStudentById } from '../../auth/auth.service.js';

export const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    const decoded = verifyToken(token);
    const user = await getStudentById(decoded.userId);

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.data.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
};
