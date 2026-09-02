import { z } from 'zod';

export const webSocketMessageSchema = z.object({
  type: z.string(),
  room: z.string().optional(),
  targetClientId: z.string().optional(),
  data: z.any().optional(),
  timestamp: z.number().optional(),
  senderId: z.string().optional(),
});

export type WebSocketMessage = z.infer<typeof webSocketMessageSchema>;

export const validateMessage = (data: unknown): WebSocketMessage => {
  return webSocketMessageSchema.parse(data);
};
