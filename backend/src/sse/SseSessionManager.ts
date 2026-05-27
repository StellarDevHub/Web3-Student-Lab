import { Response } from 'express';

interface SseClient {
  id: string;
  res: Response;
  heartbeat: NodeJS.Timeout;
}

export class SseSessionManager {
  private sessions = new Map<string, Map<string, SseClient>>();
  private clientCounter = 0;

  constructor(private readonly heartbeatIntervalMs = 25000) {}

  addClient(sessionId: string, res: Response): string {
    const clientId = `${Date.now()}-${this.clientCounter++}`;
    const heartbeat = setInterval(() => {
      this.writeRaw(res, ': keep-alive\n\n');
    }, this.heartbeatIntervalMs);

    const client: SseClient = { id: clientId, res, heartbeat };
    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.set(clientId, client);
    } else {
      this.sessions.set(sessionId, new Map([[clientId, client]]));
    }

    return clientId;
  }

  removeClient(sessionId: string, clientId: string): void {
    const clients = this.sessions.get(sessionId);
    if (!clients) {
      return;
    }

    const client = clients.get(clientId);
    if (!client) {
      return;
    }

    clearInterval(client.heartbeat);
    clients.delete(clientId);

    if (clients.size === 0) {
      this.sessions.delete(sessionId);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    const clients = this.sessions.get(userId);
    if (!clients || clients.size === 0) {
      return;
    }

    const message = this.formatEvent(event, payload);

    for (const [clientId, client] of clients.entries()) {
      const success = this.writeRaw(client.res, message);
      if (!success) {
        this.removeClient(userId, clientId);
      }
    }
  }

  private formatEvent(event: string, payload: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private writeRaw(res: Response, chunk: string): boolean {
    try {
      res.write(chunk);
      return true;
    } catch {
      return false;
    }
  }
}

export const sseSessionManager = new SseSessionManager();
