import { errorHandler } from '../src/middleware/errorHandler.js';
import { captureException } from '../src/utils/sentry.js';
import { ApiError, ERROR_ENVELOPE_VERSION } from '../src/utils/apiError.js';

jest.mock('../src/utils/sentry.js', () => ({
  captureException: jest.fn(),
}));

const mockRequest = (overrides: Record<string, unknown> = {}) =>
  ({
    method: 'GET',
    originalUrl: '/api/v1/example',
    headers: {},
    ...overrides,
  }) as any;

const mockResponse = () => {
  const res: any = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res;
};

describe('Global Error Handler (error envelope)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('captures the exception and returns the versioned 500 envelope', () => {
    const err = new Error('test-error');
    const res = mockResponse();
    const next = jest.fn();

    errorHandler(err, mockRequest({ correlationId: 'corr-123' }), res, next);

    expect(captureException).toHaveBeenCalledWith(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'corr-123');
    expect(next).not.toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatchObject({
      version: ERROR_ENVELOPE_VERSION,
      code: 'INTERNAL_ERROR',
      requestId: 'corr-123',
    });
    // Internal detail must not reach the client.
    expect(body.error.message).not.toContain('test-error');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('preserves status, code and field errors from an ApiError', () => {
    const err = ApiError.validationFailed('Request validation failed', [
      { field: 'tier', message: 'Invalid tier' },
    ]);
    const res = mockResponse();

    errorHandler(err, mockRequest({ correlationId: 'corr-456' }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.fieldErrors).toEqual([{ field: 'tier', message: 'Invalid tier' }]);
  });

  it('falls back to inbound trace headers for the request id', () => {
    const res = mockResponse();

    errorHandler(
      ApiError.notFound('nope'),
      mockRequest({ headers: { 'x-request-id': 'header-789' } }),
      res,
      jest.fn()
    );

    expect(res.json.mock.calls[0][0].error.requestId).toBe('header-789');
  });

  it('delegates to next() once headers have been sent', () => {
    const err = new Error('late failure');
    const res = mockResponse();
    res.headersSent = true;
    const next = jest.fn();

    errorHandler(err, mockRequest(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});
