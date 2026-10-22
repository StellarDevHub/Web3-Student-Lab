import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  WebhookRetriggerError,
  endpointCircuitBreaker,
  retriggerDelivery,
  retriggerFailedDeliveries,
  webhookDeliveryLog,
} from '../services/webhookDeliveryService.js';
import logger from '../utils/logger.js';
import { ApiResponse } from '../utils/response.js';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Admin controls for the webhook delivery engine (Issue BE-015): inspect the
 * delivery log, manually re-trigger failed deliveries and resume endpoints
 * paused by the circuit breaker.
 */
export const webhookController = {
  // GET /admin/webhooks/deliveries?status=failed&endpoint=...&event=...&limit=...
  listDeliveries: asyncHandler(async (req: Request, res: Response) => {
    const status = queryString(req.query.status);
    const endpointKey = queryString(req.query.endpoint);
    const eventType = queryString(req.query.event);
    const limit = Number(req.query.limit);

    const deliveries = webhookDeliveryLog.list({
      ...(status ? { status } : {}),
      ...(endpointKey ? { endpointKey } : {}),
      ...(eventType ? { eventType } : {}),
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    });

    return res
      .status(200)
      .json(ApiResponse.success('Webhook deliveries retrieved', { count: deliveries.length, deliveries }));
  }),

  // GET /admin/webhooks/deliveries/:deliveryId
  getDelivery: asyncHandler(async (req: Request, res: Response) => {
    const delivery = webhookDeliveryLog.get(String(req.params.deliveryId));
    if (!delivery) {
      return res.status(404).json(ApiResponse.error('Delivery not found'));
    }
    return res.status(200).json(ApiResponse.success('Webhook delivery retrieved', delivery));
  }),

  // POST /admin/webhooks/deliveries/:deliveryId/retrigger  { resumeEndpoint?: boolean }
  retriggerDelivery: asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await retriggerDelivery(String(req.params.deliveryId), {
        resumeEndpoint: Boolean(req.body?.resumeEndpoint),
        ...((req as any).user?.id ? { requestedBy: (req as any).user.id } : {}),
      });
      return res.status(202).json(ApiResponse.success('Webhook delivery re-triggered', result));
    } catch (error) {
      if (error instanceof WebhookRetriggerError) {
        return res.status(error.statusCode).json(ApiResponse.error(error.message));
      }
      logger.error('Failed to re-trigger webhook delivery:', error);
      return res.status(500).json(ApiResponse.error('Failed to re-trigger webhook delivery'));
    }
  }),

  // POST /admin/webhooks/deliveries/retrigger-failed  { endpoint?: string }
  retriggerFailed: asyncHandler(async (req: Request, res: Response) => {
    const endpointKey = queryString(req.body?.endpoint);
    const results = await retriggerFailedDeliveries({
      ...(endpointKey ? { endpointKey } : {}),
      ...((req as any).user?.id ? { requestedBy: (req as any).user.id } : {}),
    });
    return res
      .status(202)
      .json(ApiResponse.success('Failed webhook deliveries re-triggered', { count: results.length, results }));
  }),

  // GET /admin/webhooks/endpoints
  listEndpoints: asyncHandler(async (_req: Request, res: Response) => {
    const endpoints = endpointCircuitBreaker.list();
    return res
      .status(200)
      .json(ApiResponse.success('Webhook endpoint circuits retrieved', { count: endpoints.length, endpoints }));
  }),

  // POST /admin/webhooks/endpoints/resume  { endpoint: string }
  resumeEndpoint: asyncHandler(async (req: Request, res: Response) => {
    const endpointKey = queryString(req.body?.endpoint);
    if (!endpointKey) {
      return res.status(400).json(ApiResponse.error('endpoint is required'));
    }
    const state = endpointCircuitBreaker.resume(endpointKey);
    if (!state) {
      return res.status(404).json(ApiResponse.error('Endpoint not found'));
    }
    return res.status(200).json(ApiResponse.success('Webhook endpoint resumed', state));
  }),
};
