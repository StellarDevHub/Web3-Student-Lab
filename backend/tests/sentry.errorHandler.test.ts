import { errorHandler } from '../src/middleware/errorHandler.js';
import { captureException } from '../src/utils/sentry.js';

jest.mock('../src/utils/sentry.js', () => ({
  captureException: jest.fn(),
}));

describe('Global Error Handler', () => {
  it('captures exception and returns standardized 500 response', () => {
    const err = new Error('test-error');
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(err, {} as any, res, next);

    expect(captureException).toHaveBeenCalledWith(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
