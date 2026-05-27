import { Response } from 'express';
import { SseSessionManager } from '../src/sse/SseSessionManager.js';

const createMockResponse = (): Response => {
  return {
    write: jest.fn(),
  } as unknown as Response;
};

describe('SseSessionManager', () => {
  it('emits events to all clients in a user session', () => {
    const manager = new SseSessionManager(60000);
    const responseA = createMockResponse();
    const responseB = createMockResponse();

    const clientA = manager.addClient('user-1', responseA);
    const clientB = manager.addClient('user-1', responseB);

    manager.emitToUser('user-1', 'user_metrics_updated', {
      type: 'EXPORT_PROGRESS',
      progress: 40,
    });

    expect(responseA.write).toHaveBeenCalledWith(
      expect.stringContaining('event: user_metrics_updated')
    );
    expect(responseA.write).toHaveBeenCalledWith(expect.stringContaining('"progress":40'));
    expect(responseB.write).toHaveBeenCalledWith(
      expect.stringContaining('event: user_metrics_updated')
    );

    manager.removeClient('user-1', clientA);
    manager.removeClient('user-1', clientB);
  });

  it('stops emitting after a client disconnects', () => {
    const manager = new SseSessionManager(60000);
    const response = createMockResponse();

    const clientId = manager.addClient('user-2', response);
    manager.removeClient('user-2', clientId);
    manager.emitToUser('user-2', 'user_metrics_updated', {
      type: 'EXPORT_COMPLETED',
    });

    expect(response.write).not.toHaveBeenCalled();
  });
});
