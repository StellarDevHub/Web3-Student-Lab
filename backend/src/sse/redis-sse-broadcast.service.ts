import { Injectable, Logger } from '@nestjs/common';
import * as Redis from 'redis';
import { Response } from 'express';

/**
 * BE-025: Real-Time Server-Sent Events (SSE) Broadcast Engine with Redis Pub/Sub Replication.
 * Handles SSE notifications across multi-instance deployments using Redis Pub/Sub.
 * Eliminates per-process memory constraints and enables proper scaling.
 */
@Injectable()
export class RedisSseBroadcastService {
  private readonly logger = new Logger(RedisSseBroadcastService.name);
  private redisPublisher: Redis.RedisClient;
  private redisSubscriber: Redis.RedisClient;
  private connections: Map<string, Response> = new Map();
  private connectionsByChannel: Map<string, Set<string>> = new Map();

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    // Create publisher connection
    this.redisPublisher = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      },
    });

    // Create subscriber connection (must be separate from publisher)
    this.redisSubscriber = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });

    // Handle Redis messages
    this.redisSubscriber.on('message', (channel, message) => {
      this.broadcastToConnections(channel, message);
    });

    this.redisSubscriber.on('error', (err) => {
      this.logger.error(`Redis subscriber error: ${err}`);
    });

    this.redisPublisher.on('error', (err) => {
      this.logger.error(`Redis publisher error: ${err}`);
    });

    this.logger.log('Redis connections initialized for SSE broadcasting');
  }

  /**
   * Register a new SSE client connection.
   * Client receives all messages published to its channels.
   */
  registerConnection(clientId: string, response: Response, channels: string[]): void {
    this.connections.set(clientId, response);

    // Setup SSE response headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection message
    response.write(':connected\n\n');

    // Subscribe to channels
    for (const channel of channels) {
      if (!this.connectionsByChannel.has(channel)) {
        this.connectionsByChannel.set(channel, new Set());
        this.redisSubscriber.subscribe(channel, (err) => {
          if (err) {
            this.logger.error(`Failed to subscribe to ${channel}: ${err}`);
          } else {
            this.logger.log(`Subscribed to channel: ${channel}`);
          }
        });
      }

      this.connectionsByChannel.get(channel)?.add(clientId);
    }

    this.logger.log(`Client registered: ${clientId} on channels [${channels.join(', ')}]`);

    // Handle client disconnect
    response.on('close', () => {
      this.unregisterConnection(clientId, channels);
    });

    response.on('error', () => {
      this.unregisterConnection(clientId, channels);
    });
  }

  /**
   * Unregister SSE client connection
   */
  private unregisterConnection(clientId: string, channels: string[]): void {
    this.connections.delete(clientId);

    for (const channel of channels) {
      this.connectionsByChannel.get(channel)?.delete(clientId);

      // Unsubscribe if no more clients on channel
      if (this.connectionsByChannel.get(channel)?.size === 0) {
        this.redisSubscriber.unsubscribe(channel);
        this.connectionsByChannel.delete(channel);
        this.logger.log(`Unsubscribed from channel: ${channel}`);
      }
    }

    this.logger.log(`Client unregistered: ${clientId}`);
  }

  /**
   * Publish event to channel.
   * Broadcast to all connected clients across all instances via Redis.
   */
  publishEvent(channel: string, eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      source: process.env.INSTANCE_ID || 'unknown',
    });

    // Publish to Redis (reaches all instances)
    this.redisPublisher.publish(channel, message, (err) => {
      if (err) {
        this.logger.error(`Failed to publish to ${channel}: ${err}`);
      } else {
        this.logger.debug(`Event published to ${channel}`);
      }
    });
  }

  /**
   * Broadcast message to all local connections on channel
   */
  private broadcastToConnections(channel: string, message: string): void {
    const clientIds = this.connectionsByChannel.get(channel) || new Set();

    for (const clientId of clientIds) {
      const response = this.connections.get(clientId);
      if (response && !response.writableEnded) {
        try {
          response.write(`data: ${message}\n\n`);
        } catch (error) {
          this.logger.error(`Error writing to client ${clientId}: ${error}`);
          this.connections.delete(clientId);
        }
      }
    }
  }

  /**
   * Send keepalive ping to prevent connection timeout
   */
  startKeepalive(interval: number = 30000): void {
    setInterval(() => {
      for (const [clientId, response] of this.connections) {
        if (!response.writableEnded) {
          try {
            response.write(':keepalive\n\n');
          } catch (error) {
            this.logger.debug(`Keepalive failed for ${clientId}, removing connection`);
            this.connections.delete(clientId);
          }
        }
      }
    }, interval);

    this.logger.log(`SSE keepalive started (interval: ${interval}ms)`);
  }

  /**
   * Get connection statistics for monitoring
   */
  getStats(): {
    totalConnections: number;
    channelCount: number;
    channels: Record<string, number>;
  } {
    const channels: Record<string, number> = {};

    for (const [channel, clients] of this.connectionsByChannel) {
      channels[channel] = clients.size;
    }

    return {
      totalConnections: this.connections.size,
      channelCount: this.connectionsByChannel.size,
      channels,
    };
  }

  async onModuleDestroy(): Promise<void> {
    // Close all client connections
    for (const response of this.connections.values()) {
      if (!response.writableEnded) {
        response.end();
      }
    }

    // Close Redis connections
    this.redisPublisher.quit();
    this.redisSubscriber.quit();

    this.logger.log('SSE Broadcast Service shutdown complete');
  }
}
