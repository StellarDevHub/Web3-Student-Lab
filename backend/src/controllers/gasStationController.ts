import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getGasQuotaUsage } from '../middleware/gasQuotaMiddleware.js';
import { GasStationError, gasStationService } from '../services/gasStationService.js';
import { ApiResponse } from '../utils/response.js';

const sponsorSchema = z.object({
  innerTxXdr: z.string().min(10),
  turnstileToken: z.string().min(1).optional(),
});

export const gasStationController = {
  // Wrap a student-signed transaction in a relayer fee-bump and submit it
  sponsor: asyncHandler(async (req: Request, res: Response) => {
    const parsed = sponsorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(ApiResponse.error('innerTxXdr is required', parsed.error.issues));
    }

    const user = req.user!;
    const countryCode =
      (req.headers['cf-ipcountry'] as string | undefined) ||
      (req.headers['x-vercel-ip-country'] as string | undefined) ||
      (req.headers['x-country-code'] as string | undefined);

    try {
      const result = await gasStationService.sponsor({
        studentId: user.id,
        studentPublicKey: user.walletAddress || '',
        innerTxXdr: parsed.data.innerTxXdr,
        turnstileToken: parsed.data.turnstileToken,
        clientIp: req.ip,
        countryCode,
      });
      return res.status(200).json(ApiResponse.success('Transaction sponsored', result));
    } catch (err) {
      if (err instanceof GasStationError) {
        return res.status(err.statusCode).json(ApiResponse.error(err.message));
      }
      throw err;
    }
  }),

  // Today's sponsorship usage for the authenticated student
  getQuota: asyncHandler(async (req: Request, res: Response) => {
    const [usage, dailyTransactions] = await Promise.all([
      getGasQuotaUsage(req.user!.id),
      gasStationService.getDailyTxCount(req.user!.id),
    ]);
    return res
      .status(200)
      .json(ApiResponse.success('Gas quota retrieved', { ...usage, dailyTransactions }));
  }),

  // Verified course contracts eligible for sponsorship
  getWhitelist: asyncHandler(async (_req: Request, res: Response) => {
    return res
      .status(200)
      .json(ApiResponse.success('Sponsored contracts retrieved', { contracts: gasStationService.getWhitelist() }));
  }),
};
