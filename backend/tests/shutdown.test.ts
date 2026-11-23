import http from 'http';
import { AddressInfo } from 'net';
import { ShutdownCoordinator } from '../src/utils/shutdown';

const silentLogger = { info: () => {}, error: () => {} };

describe('ShutdownCoordinator', () => {
  it('closes the HTTP server and runs worker and client teardown', async () => {
    const coordinator = new ShutdownCoordinator({ logger: silentLogger, exitOnShutdown: false });
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    coordinator.setServer(server);

    const worker = jest.fn(async () => {});
    const client = jest.fn(async () => {});
    coordinator.registerWorker(worker);
    coordinator.registerClient(client);

    await coordinator.closeAllConnections();

    expect(server.listening).toBe(false);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledTimes(1);
  });

  it('destroys open keep-alive sockets so the server can close', async () => {
    const coordinator = new ShutdownCoordinator({ logger: silentLogger, exitOnShutdown: false });
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    coordinator.setServer(server);

    const { port } = server.address() as AddressInfo;
    const agent = new http.Agent({ keepAlive: true });
    await new Promise<void>((resolve, reject) => {
      http
        .get({ port, host: '127.0.0.1', agent }, (res) => {
          res.resume();
          res.on('end', () => resolve());
        })
        .on('error', reject);
    });

    await expect(coordinator.closeAllConnections()).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
    agent.destroy();
  });

  it('shutdown() completes without exiting the process when exitOnShutdown is false', async () => {
    const coordinator = new ShutdownCoordinator({ logger: silentLogger, exitOnShutdown: false });
    const client = jest.fn(async () => {});
    coordinator.registerClient(client);

    await coordinator.shutdown('SIGTERM');

    expect(client).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: repeated shutdown calls run teardown once', async () => {
    const coordinator = new ShutdownCoordinator({ logger: silentLogger, exitOnShutdown: false });
    const client = jest.fn(async () => {});
    coordinator.registerClient(client);

    await coordinator.shutdown('SIGINT');
    await coordinator.shutdown('SIGTERM');

    expect(client).toHaveBeenCalledTimes(1);
  });

  it('registers and removes SIGTERM/SIGINT listeners', () => {
    const coordinator = new ShutdownCoordinator({ logger: silentLogger, exitOnShutdown: false });
    const before = process.listenerCount('SIGTERM');
    coordinator.listen(['SIGTERM', 'SIGINT']);
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    coordinator.removeSignalListeners();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
