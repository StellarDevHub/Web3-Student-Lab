import { Socket } from 'socket.io';

export interface WebSocketConnection {
  id: string;
  userId: string;
  rooms: string[];
  connectedAt: Date;
  lastPing: Date;
  metadata: Record<string, any>;
}

export class ConnectionManager {
  private connections: Map<string, WebSocketConnection> = new Map();

  addConnection(socket: Socket) {
    this.connections.set(socket.id, {
      id: socket.id,
      userId: socket.data.user.id,
      rooms: [],
      connectedAt: new Date(),
      lastPing: new Date(),
      metadata: {},
    });
  }

  updatePing(socketId: string) {
    const conn = this.connections.get(socketId);
    if (conn) {
      conn.lastPing = new Date();
      this.connections.set(socketId, conn);
    }
  }

  removeConnection(socketId: string) {
    this.connections.delete(socketId);
  }

  getConnection(socketId: string) {
    return this.connections.get(socketId);
  }
}
