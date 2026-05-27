import { Socket } from 'socket.io';

const WINDOW_MS = 60000;
const MAX_MESSAGES = 100;
const messageCounts = new Map<string, { count: number; startTime: number }>();

export const rateLimitMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  socket.use((packet, pass) => {
    const now = Date.now();
    const record = messageCounts.get(socket.id) || { count: 0, startTime: now };

    if (now - record.startTime > WINDOW_MS) {
      record.count = 0;
      record.startTime = now;
    }

    record.count++;
    messageCounts.set(socket.id, record);

    if (record.count > MAX_MESSAGES) {
      return pass(new Error('Rate limit exceeded: Too many messages'));
    }
    pass();
  });

  next();
};
