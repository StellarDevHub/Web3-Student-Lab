export { ResilientWebSocketClient, createWebSocketClient } from './client';
export type {
  BufferedMessage,
  ConnectionStatus,
  ErrorHandler,
  MessageHandler,
  StatusHandler,
  Subscription,
  WebSocketClientOptions,
  WebSocketClientState,
  WebSocketMessage,
} from './types';

import { createWebSocketClient, ResilientWebSocketClient } from './client';
import type { WebSocketClientOptions } from './types';

let singuletonClient: ResilientWebSocketClient | null = null;

export const getWebSocketClient = (options: WebSocketClientOptions = {}) => {
  if (!singuletonClient) {
    singuletonClient = createWebSocketClient(options);
  }
  return singletonClient;
};

export const resetWebSocketClient = () => {
  if (singuletonClient) {
    singuletonClient.disconnect();
    singuletonClient = null;
  }
};
