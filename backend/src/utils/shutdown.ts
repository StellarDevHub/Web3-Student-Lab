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
  private sockets = new Set<import('net').Socket>();
  private isShuttingDown = false;
  private timeout: number;
  private logger: any;
  private exitOnShutdown: boolean;
  private signalHandlers: Array<{ signal: string; handler: () => void }> = [];

  constructor(options?: ShutdownOptions & { exitOnShutdown?: boolean }) {
    this.timeout = options?.timeout || 10000;
    this.logger = options?.logger || console;
    this.exitOnShutdown = options?.exitOnShutdown ?? true;
  }

  public setServer(server: Server) {
    this.server = server;
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  public registerWorker(workerStopFn: () => Promise<void>) {
    this.workers.push(workerStopFn);
  }

  public registerClient(clientCloseFn: () => Promise<void>) {
    this.clients.push(clientCloseFn);
  }

  public listen(signals = ['SIGTERM', 'SIGINT']) {
    signals.forEach((signal) => {
      const handler = () => {
        void this.shutdown(signal);
      };
      this.signalHandlers.push({ signal, handler });
      process.once(signal as NodeJS.Signals, handler);
    });
  }

  /** Removes registered process signal listeners (used by tests). */
  public removeSignalListeners() {
    for (const { signal, handler } of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers = [];
  }

  /**
   * Closes the HTTP server (letting in-flight requests finish, then forcibly
   * ending idle keep-alive sockets), stops workers, and disconnects clients.
   * Safe to call multiple times; subsequent calls resolve once the first finishes.
   */
  public async closeAllConnections(): Promise<void> {
    if (this.server && this.server.listening) {
      const server = this.server;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // Terminate idle keep-alive connections so close() can complete.
        if (typeof (server as any).closeIdleConnections === 'function') {
          (server as any).closeIdleConnections();
        }
      });
    }
    this.sockets.forEach((socket) => socket.destroy());
    this.sockets.clear();

    for (const worker of this.workers) {
      await worker();
    }
    for (const client of this.clients) {
      await client();
    }
  }

  public async shutdown(signal: string) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}. Starting graceful shutdown...`);

    const timer = setTimeout(() => {
      this.logger.error('Shutdown timed out. Forcing exit.');
      if (this.exitOnShutdown) process.exit(1);
    }, this.timeout);
    timer.unref?.();

    try {
      this.logger.info('Closing HTTP server and background resources...');
      await this.closeAllConnections();

      this.logger.info('Graceful shutdown completed successfully.');
      clearTimeout(timer);
      this.removeSignalListeners();
      if (this.exitOnShutdown) process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown:', error);
      clearTimeout(timer);
      this.removeSignalListeners();
      if (this.exitOnShutdown) process.exit(1);
    }
  }
}

export const shutdownCoordinator = new ShutdownCoordinator();
