import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
    private readonly registry: client.Registry;
    public readonly httpRequestDurationMicroseconds: client.Histogram<string>;
    public readonly activeDbConnections: client.Gauge<string>;
    public readonly queueLength: client.Gauge<string>;
    public readonly httpRequestsTotal: client.Counter<string>;

    constructor() {
        this.registry = new client.Registry();
        client.collectDefaultMetrics({ register: this.registry });

        this.httpRequestDurationMicroseconds = new client.Histogram({
            name: 'http_request_duration_ms',
            labelNames: ['method', 'route', 'status_code'],
            help: 'Duration of HTTP requests in milliseconds',
            buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
            registers: [this.registry],
        });

        this.httpRequestsTotal = new client.Counter({
            name: 'http_requests_total',
            labelNames: ['method', 'route', 'status_code'],
            help: 'Total number of HTTP requests',
            registers: [this.registry],
        });

        this.activeDbConnections = new client.Gauge({
            name: 'db_active_connections',
            help: 'Number of active database connections in the pool',
            registers: [this.registry],
        });

        this.queueLength = new client.Gauge({
            name: 'background_queue_length',
            labelNames: ['queue_name'],
            help: 'Number of active jobs waiting or processing in background queues',
            registers: [this.registry],
        });
    }

    onModuleInit() {
        // Initialize default gauges
        this.activeDbConnections.set(5);
        this.queueLength.set({ queue_name: 'smart-contract-deployments' }, 0);
    }

    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    getContentType(): string {
        return this.registry.contentType;
    }
}
