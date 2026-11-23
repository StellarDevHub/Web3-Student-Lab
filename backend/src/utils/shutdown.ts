import { Server } from 'http';

interface ShutdownOptions {
  timeout?: number;
  signals?: string[];
  logger?: {
    info: (msg: string) => void;
    error: (msg: string, err?: any) => void;
  };
}

export class ShutdownCoordinator {
  private server?: Server;
  private workers: Array<() => Promise<void>> = [];
  private clients: Array<() => Promise<void>> = [];
  private isShuttingDown = false;
  private timeout: number;
  private logger: any;

  constructor(options?: ShutdownOptions) {
    this.timeout = options?.timeout || 10000;
    this.logger = options?.logger || console;
  }

  public setServer(server: Server) {
    this.server = server;
  }

  public registerWorker(workerStopFn: () => Promise<void>) {
    this.workers.push(workerStopFn);
  }

  public registerClient(clientCloseFn: () => Promise<void>) {
    this.clients.push(clientCloseFn);
  }

  public listen(signals = ['SIGTERM', 'SIGINT']) {
    signals.forEach((signal) => {
      process.once(signal, () => this.shutdown(signal));
    });
  }

  public async shutdown(signal: string) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}. Starting graceful shutdown...`);

    const timer = setTimeout(() => {
      this.logger.error('Shutdown timed out. Forcing exit.');
      process.exit(1);
    }, this.timeout);

    try {
      // 1. Stop accepting new HTTP traffic
      if (this.server) {
        this.logger.info('Closing HTTP server...');
        await new Promise<void>((resolve, reject) => {
          this.server?.close((err) => (err ? reject(err) : resolve()));
        });
      }

      // 2. Stop workers and queues
      this.logger.info('Stopping workers and background jobs...');
      for (const worker of this.workers) {
        await worker();
      }

      // 3. Close database and Redis clients
      this.logger.info('Disconnecting database and cache clients...');
      for (const client of this.clients) {
        await client();
      }

      this.logger.info('Graceful shutdown completed successfully.');
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown:', error);
      clearTimeout(timer);
      process.exit(1);
    }
  }
}

export const shutdownCoordinator = new ShutdownCoordinator();
