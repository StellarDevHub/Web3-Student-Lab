import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * BE-022: Multi-region read replica routing with primary write connection pooling.
 * Routes read queries to regional replicas while maintaining write consistency on primary.
 */
@Injectable()
export class DatabaseRouter {
  private readonly logger = new Logger(DatabaseRouter.name);
  private primaryDb: PrismaClient;
  private readReplicas: Map<string, PrismaClient>;
  private replicaHealthStatus: Map<string, boolean>;
  private currentReplicaIndex = 0;

  constructor() {
    this.readReplicas = new Map();
    this.replicaHealthStatus = new Map();
    this.initializeConnections();
  }

  private initializeConnections(): void {
    // Primary database for writes
    this.primaryDb = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Read replicas by region
    const replicas = [
      {
        name: 'us-east',
        url: process.env.DATABASE_REPLICA_US_URL,
      },
      {
        name: 'eu-west',
        url: process.env.DATABASE_REPLICA_EU_URL,
      },
      {
        name: 'apac-sg',
        url: process.env.DATABASE_REPLICA_APAC_URL,
      },
    ];

    for (const replica of replicas) {
      if (replica.url) {
        const client = new PrismaClient({
          datasources: {
            db: {
              url: replica.url,
            },
          },
        });
        this.readReplicas.set(replica.name, client);
        this.replicaHealthStatus.set(replica.name, true);
      }
    }

    this.logger.log(`Initialized primary database and ${this.readReplicas.size} read replicas`);
  }

  /**
   * Get primary database connection for write operations
   */
  getPrimaryDb(): PrismaClient {
    return this.primaryDb;
  }

  /**
   * Get read replica with load balancing and health checking.
   * Falls back to primary if all replicas are down.
   */
  getReadDb(): PrismaClient {
    if (this.readReplicas.size === 0) {
      this.logger.warn('No read replicas available, using primary for reads');
      return this.primaryDb;
    }

    // Round-robin through healthy replicas
    const replicaNames = Array.from(this.readReplicas.keys());
    let attempts = 0;

    while (attempts < replicaNames.length) {
      const replicaName = replicaNames[this.currentReplicaIndex % replicaNames.length];
      this.currentReplicaIndex++;

      if (this.replicaHealthStatus.get(replicaName)) {
        return this.readReplicas.get(replicaName)!;
      }
      attempts++;
    }

    this.logger.warn('All read replicas unhealthy, falling back to primary');
    return this.primaryDb;
  }

  /**
   * Health check for read replicas
   */
  async checkReplicaHealth(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();

    for (const [name, client] of this.readReplicas) {
      try {
        await client.$queryRaw`SELECT 1`;
        health.set(name, true);
        this.replicaHealthStatus.set(name, true);
      } catch (error) {
        this.logger.error(`Read replica ${name} health check failed: ${error}`);
        health.set(name, false);
        this.replicaHealthStatus.set(name, false);
      }
    }

    return health;
  }

  /**
   * Execute read query on most appropriate replica
   */
  async executeRead<T>(query: (client: PrismaClient) => Promise<T>): Promise<T> {
    const client = this.getReadDb();
    return query(client);
  }

  /**
   * Execute write query on primary database
   */
  async executeWrite<T>(query: (client: PrismaClient) => Promise<T>): Promise<T> {
    const client = this.getPrimaryDb();
    return query(client);
  }

  /**
   * Get replica status for monitoring
   */
  getReplicaStatus(): Record<string, { healthy: boolean; region: string }> {
    const status: Record<string, { healthy: boolean; region: string }> = {};

    for (const [name, healthy] of this.replicaHealthStatus) {
      status[name] = {
        healthy,
        region: name,
      };
    }

    return status;
  }

  async onModuleDestroy(): Promise<void> {
    await this.primaryDb.$disconnect();
    for (const client of this.readReplicas.values()) {
      await client.$disconnect();
    }
  }
}
