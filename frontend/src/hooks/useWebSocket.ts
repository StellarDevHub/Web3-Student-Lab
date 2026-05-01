import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export const useWebSocket = (url?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    const socketUrl = url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    
    socketRef.current = io(socketUrl, {
      auth: {
        token
      },
      transports: ['websocket', 'polling']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (error) => {
      setError(error.message);
      console.error('WebSocket connection error:', error);
    });

    socket.on('message', (message: WebSocketMessage) => {
      setLastMessage(message);
    });

    socket.on('subscription_created', (data) => {
      setLastMessage({
        type: 'subscription_created',
        data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('subscription_cancelled', (data) => {
      setLastMessage({
        type: 'subscription_cancelled',
        data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('subscription_renewed', (data) => {
      setLastMessage({
        type: 'subscription_renewed',
        data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('plan_updated', (data) => {
      setLastMessage({
        type: 'plan_updated',
        data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('contract_paused', (data) => {
      setLastMessage({
        type: 'contract_paused',
        data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('contract_unpaused', (data) => {
      setLastMessage({
        type: 'contract_unpaused',
        data,
        timestamp: new Date().toISOString()
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [url]);

  const sendMessage = (type: string, data: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('message', {
        type,
        data,
        timestamp: new Date().toISOString()
      });
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const reconnect = () => {
    if (socketRef.current) {
      socketRef.current.connect();
    }
  };

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    disconnect,
    reconnect
  };
};
