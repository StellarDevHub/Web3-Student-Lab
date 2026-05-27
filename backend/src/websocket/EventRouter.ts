import { Server, Socket } from 'socket.io';
import { RoomManager } from './RoomManager.js';
import { ConnectionManager } from './ConnectionManager.js';
import { validateMessage } from './MessageValidator.js';
import logger from '../utils/logger.js';

export class EventRouter {
  private roomManager: RoomManager;

  constructor(
    private io: Server,
    private connectionManager: ConnectionManager
  ) {
    this.roomManager = new RoomManager(io);
  }

  registerHandlers(socket: Socket) {
    socket.on('ping', () => {
      this.connectionManager.updatePing(socket.id);
      socket.emit('pong');
    });

    socket.on('room:join', (room: string) => {
      this.roomManager.joinRoom(socket, room);
    });

    socket.on('room:leave', (room: string) => {
      this.roomManager.leaveRoom(socket, room);
    });

    socket.on('collaboration:message', (rawPayload: unknown) => {
      try {
        const message = validateMessage(rawPayload);
        if (message.room) {
          socket.to(message.room).emit('collaboration:update', message);
        }
      } catch (error) {
        logger.error(`Invalid message from ${socket.id}:`, error);
        socket.emit('error', { message: 'Invalid payload format' });
      }
    });
  }
}
