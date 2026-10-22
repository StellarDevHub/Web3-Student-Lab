/**
 * Decentralized identity endpoints (Issue BE-016).
 *
 *   GET  /api/v1/identity/did/:did                       -> W3C DID Resolution result
 *   GET  /api/v1/identity/issuer                         -> institutional issuer DID document
 *   POST /api/v1/identity/credentials/issue              -> issue a signed W3C VC (admin)
 *   POST /api/v1/identity/credentials/verify             -> verify proof + on-chain revocation
 *   POST /api/v1/identity/credentials/validate           -> W3C VC schema validation only
 *   GET  /api/v1/identity/credentials/status/:revocationId -> Soroban revocation status
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  credentialIssuanceService,
  validateCredentialSchema,
} from '../services/credentialIssuanceService.js';
import { didResolverService, type DidResolutionResult } from '../services/didResolverService.js';
import logger from '../utils/logger.js';

const router: Router = Router();

const issueSchema = z.object({
  subjectId: z.string().min(1),
  credentialType: z.string().min(1).max(128).optional(),
  claims: z.record(z.string(), z.unknown()).default({}),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  revocationId: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});

const resolutionStatus = (result: DidResolutionResult): number => {
  switch (result.didResolutionMetadata.error) {
    case 'invalidDid':
      return 400;
    case 'notFound':
      return 404;
    case 'methodNotSupported':
      return 501;
    case 'internalError':
      return 500;
    default:
      return result.didDocumentMetadata.deactivated ? 410 : 200;
  }
};

router.get('/did/:did', async (req: Request, res: Response) => {
  const result = await didResolverService.resolve(String(req.params.did));
  const wantsDocumentOnly = (req.get('accept') ?? '').includes('application/did+ld+json');
  if (wantsDocumentOnly && result.didDocument) {
    res.type('application/did+ld+json');
    return res.status(resolutionStatus(result)).send(JSON.stringify(result.didDocument));
  }
  return res.status(resolutionStatus(result)).json(result);
});

router.get('/issuer', async (_req: Request, res: Response) => {
  const result = await credentialIssuanceService.getIssuerDidDocument();
  return res.status(resolutionStatus(result)).json(result);
});

router.post(
  '/credentials/issue',
  authenticateToken as any,
  requireAdmin as any,
  (req: Request, res: Response) => {
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
    }
    try {
      const { credentialType, validFrom, validUntil, revocationId, ...rest } = parsed.data;
      const credential = credentialIssuanceService.issueCredential({
        ...rest,
        ...(credentialType ? { credentialType } : {}),
        ...(validFrom ? { validFrom } : {}),
        ...(validUntil ? { validUntil } : {}),
        ...(revocationId ? { revocationId } : {}),
      });
      return res.status(201).json(credential);
    } catch (error) {
      logger.error('Failed to issue verifiable credential:', error);
      return res.status(400).json({ error: (error as Error).message });
    }
  }
);

router.post('/credentials/verify', async (req: Request, res: Response) => {
  const credential = req.body?.credential ?? req.body;
  try {
    const result = await credentialIssuanceService.verifyCredential(credential);
    return res.status(result.valid ? 200 : 422).json(result);
  } catch (error) {
    logger.error('Failed to verify verifiable credential:', error);
    return res.status(500).json({ error: 'Failed to verify credential' });
  }
});

router.post('/credentials/validate', (req: Request, res: Response) => {
  const result = validateCredentialSchema(req.body?.credential ?? req.body);
  return res.status(result.valid ? 200 : 422).json(result);
});

router.get('/credentials/status/:revocationId', async (req: Request, res: Response) => {
  const result = await credentialIssuanceService.checkRevocationStatus(
    String(req.params.revocationId)
  );
  return res.status(200).json({ revocationId: req.params.revocationId, ...result });
});

export default router;
