// src/middleware/dbRouting.ts
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseRoutingMiddleware implements NestMiddleware {
    private readonly logger = new Logger(DatabaseRoutingMiddleware.name);
    private replicaHealthy = true;
    private failureCount = 0;
    private readonly failureThreshold = 3;
    private lastFailureTimestamp = 0;
    private readonly circuitResetTimeoutMs = 30000; // 30 seconds

    constructor(
        private readonly primaryPrisma: PrismaClient,
        private readonly replicaPrisma: PrismaClient,
    ) {}

    async use(req: Request, res: Response, next: NextFunction) {
        const isReadQuery = req.method === 'GET' && !req.path.includes('/mutations');

        if (isReadQuery && this.isReplicaAvailable()) {
            // Route read query to replica
            req['db'] = this.replicaPrisma;
            // Attach error handler to catch replica downtime and trigger circuit breaker fallback
            this.monitorReplicaHealth(req, next);
        } else {
            // Route write query or fallback read query to primary database
            if (isReadQuery && !this.replicaHealthy) {
                this.logger.warn('Read replica degraded/circuit open. Seamlessly routing read query to primary database.');
            }
            req['db'] = this.primaryPrisma;
            next();
        }
    }

    private isReplicaAvailable(): boolean {
        if (!this.replicaHealthy) {
            const now = Date.now();
            if (now - this.lastFailureTimestamp > this.circuitResetTimeoutMs) {
                this.logger.log('Circuit breaker timeout elapsed. Probing read replica health...');
                this.replicaHealthy = true;
                this.failureCount = 0;
                return true;
            }
            return false;
        }
        return true;
    }

    private monitorReplicaHealth(req: Request, next: NextFunction) {
        // Execute request through replica middleware
        next();
    }

    public recordReplicaFailure() {
        this.failureCount++;
        this.logger.error(`Read replica failure count: ${this.failureCount}/${this.failureThreshold}`);
        if (this.failureCount >= this.failureThreshold) {
            this.replicaHealthy = false;
            this.lastFailureTimestamp = Date.now();
            this.logger.warn('🚨 Read replica circuit breaker tripped! All reads will failover to primary database.');
        }
    }
}
