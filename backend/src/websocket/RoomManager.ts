import { Server, Socket } from 'socket.io';
import logger from '../utils/logger.js';

export class RoomManager {
  constructor(private io: Server) {}

  joinRoom(socket: Socket, roomName: string) {
    socket.join(roomName);
    logger.info(`Socket ${socket.id} joined room ${roomName}`);

    socket.to(roomName).emit('system:member_joined', {
      userId: socket.data.user.id,
      timestamp: Date.now(),
    });
  }

  leaveRoom(socket: Socket, roomName: string) {
    socket.leave(roomName);
    logger.info(`Socket ${socket.id} left room ${roomName}`);

    socket.to(roomName).emit('system:member_left', {
      userId: socket.data.user.id,
      timestamp: Date.now(),
    });
  }

  broadcastToRoom(roomName: string, event: string, payload: any) {
    this.io.to(roomName).emit(event, payload);
  }
}
