import { z } from 'zod';

export const webSocketMessageSchema = z.object({
  type: z.enum(['message', 'event', 'command']),
  room: z.string().optional(),
  payload: z.any(),
  timestamp: z.number(),
  senderId: z.string(),
});

export type WebSocketMessage = z.infer<typeof webSocketMessageSchema>;

export const validateMessage = (data: unknown): WebSocketMessage => {
  return webSocketMessageSchema.parse(data);
};
