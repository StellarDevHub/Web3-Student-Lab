import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { gasStationController } from '../controllers/gasStationController.js';
import { gasQuotaMiddleware } from '../middleware/gasQuotaMiddleware.js';
import { GasStationError, gasStationService } from '../services/gasStationService.js';
import { ApiResponse } from '../utils/response.js';
import { requireTurnstile } from '../middleware/turnstile.js';

const router: ReturnType<typeof Router> = Router();

/**
 * Early anti-drain guard on the gas station sponsor endpoint:
 * - Enforces geofencing via proxy country headers (CF-IPCountry / X-Country-Code)
 * - Rejects blacklisted linked wallets before quota or XDR work
 * - Rejects students who have already exhausted their daily 50-tx cap
 */
const gasStationPolicyGuard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const countryCode =
    (req.headers['cf-ipcountry'] as string | undefined) ||
    (req.headers['x-vercel-ip-country'] as string | undefined) ||
    (req.headers['x-country-code'] as string | undefined);

  try {
    gasStationService.validateGeofence(countryCode);
  } catch (err) {
    if (err instanceof GasStationError) {
      res.status(err.statusCode).json(ApiResponse.error(err.message));
      return;
    }
    next(err);
    return;
  }

  const user = req.user;
  if (!user?.id) {
    res.status(401).json(ApiResponse.error('Authentication required'));
    return;
  }

  try {
    if (user.walletAddress && (await gasStationService.isAddressBlacklisted(user.walletAddress))) {
      res
        .status(403)
        .json(
          ApiResponse.error('Address is temporarily blacklisted for 24 hours due to abusive activity')
        );
      return;
    }

    const txUsage = await gasStationService.getDailyTxCount(user.id);
    if (txUsage.remaining <= 0) {
      res
        .status(429)
        .json(ApiResponse.error(`Daily limit of ${txUsage.limit} sponsored transactions reached`));
      return;
    }
  } catch {
    res.status(503).json(ApiResponse.error('Gas sponsorship is temporarily unavailable'));
    return;
  }

  next();
};

router.get('/contracts', gasStationController.getWhitelist);
router.get('/quota', authenticate, gasStationController.getQuota);
router.post(
  '/sponsor',
  authenticate,
  requireTurnstile(),
  gasStationPolicyGuard,
  gasQuotaMiddleware,
  gasStationController.sponsor
);

export default router;
