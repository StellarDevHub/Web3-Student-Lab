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

    socket.on('webrtc:join', (roomName: string) => {
      if (typeof roomName !== 'string') {
        return socket.emit('error', { message: 'Invalid room name' });
      }
      this.roomManager.joinRoom(socket, roomName);
      socket.to(roomName).emit('webrtc:participant_joined', {
        clientId: socket.id,
        userId: socket.data.user?.id,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('webrtc:offer', (payload: any) => {
      this.relaySignal('webrtc:offer', socket, payload);
    });

    socket.on('webrtc:answer', (payload: any) => {
      this.relaySignal('webrtc:answer', socket, payload);
    });

    socket.on('webrtc:ice-candidate', (payload: any) => {
      this.relaySignal('webrtc:ice-candidate', socket, payload);
    });

    socket.on('webrtc:renegotiate', (payload: any) => {
      this.relaySignal('webrtc:renegotiate', socket, payload);
    });
  }

  private relaySignal(event: string, socket: Socket, payload: any) {
    const targetClientId = payload?.targetClientId as string | undefined;
    const room = payload?.room as string | undefined;
    const message = {
      ...payload,
      fromClientId: socket.id,
      timestamp: new Date().toISOString(),
    };

    if (targetClientId) {
      return socket.to(targetClientId).emit(event, message);
    }

    if (room) {
      return socket.to(room).emit(event, message);
    }

    socket.emit('error', { message: 'Missing targetClientId or room for WebRTC signaling' });
  }
}
