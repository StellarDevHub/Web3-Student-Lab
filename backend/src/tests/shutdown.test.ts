import { Server } from 'http';
import { ShutdownCoordinator } from '../utils/shutdown';

describe('ShutdownCoordinator', () => {
  it('executes shutdown sequence correctly', async () => {
    const mockServer = {
      close: (cb: (err?: Error) => void) => cb(),
    } as unknown as Server;

    let workerStopped = false;
    let clientClosed = false;

    const coordinator = new ShutdownCoordinator({
      timeout: 2000,
      logger: { info: () => {}, error: () => {} },
    });

    coordinator.setServer(mockServer);
    coordinator.registerWorker(async () => {
      workerStopped = true;
    });
    coordinator.registerClient(async () => {
      clientClosed = true;
    });

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await coordinator.shutdown('SIGTERM');

    expect(workerStopped).toBe(true);
    expect(clientClosed).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});
