/**
 * HTTP router exposing the `did:stellar` resolver.
 *
 *   GET  /api/v1/did/resolve/:did     -> standard JSON-LD DID Document
 *   POST /api/v1/did/bind             -> bind a GitHub handle + Ed25519 key
 *   POST /api/v1/did/verify-proof     -> cryptographically verify a claim
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  buildDidDocument,
  didBindingStore,
  parseDid,
  verifyContributorProof,
  type ContributorProofClaim,
  type ServiceEndpoint,
} from '../services/didResolver.js';

const router: Router = Router();

const bindSchema = z.object({
  did: z.string().min(1),
  githubHandle: z.string().min(1).max(64),
  publicKeyBase64: z.string().min(1),
});

const verifySchema = z.object({
  claim: z.object({
    did: z.string().min(1),
    claimType: z.enum(['pr', 'issue']),
    repo: z.string().min(1),
    itemId: z.string().min(1),
    githubHandle: z.string().min(1),
    issuedAt: z.number().int().positive(),
  }),
  signature: z.string().min(1),
});

const servicesSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      serviceEndpoint: z.string().min(1),
    })
  )
  .optional();

function publicKeyBase64FromBody(value: string): string {
  // Accept raw hex (64 chars) or base64. Normalize to base64.
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex').toString('base64');
  }
  return value;
}

router.post('/bind', (req: Request, res: Response) => {
  const parsed = bindSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  const { did, githubHandle } = parsed.data;
  try {
    parseDid(did);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
  const publicKeyBase64 = publicKeyBase64FromBody(parsed.data.publicKeyBase64);
  didBindingStore.bind(did, { githubHandle, publicKeyBase64 });
  return res.status(200).json({ ok: true, did, githubHandle });
});

router.get('/resolve/:did', (req: Request, res: Response) => {
  const didParam = req.params.did;
  if (typeof didParam !== 'string') {
    return res.status(400).json({ error: 'Invalid DID parameter' });
  }
  const did = didParam;
  try {
    parseDid(did);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const binding = didBindingStore.get(did);
  if (!binding) {
    return res.status(404).json({
      error: 'DID not found',
      hint: 'Bind a verification key via POST /api/v1/did/bind first',
    });
  }

  const services: ServiceEndpoint[] = [];
  const serviceInput = servicesSchema.parse(req.query.services ?? []);
  if (serviceInput) {
    for (const s of serviceInput) services.push(s);
  }

  const document = buildDidDocument({
    did,
    publicKeyBase64: binding.publicKeyBase64,
    githubHandle: binding.githubHandle,
    services,
  });
  return res.status(200).json(document);
});

router.post('/verify-proof', (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  const claim = parsed.data.claim as ContributorProofClaim;
  const binding = didBindingStore.get(claim.did);
  const result = verifyContributorProof(claim, parsed.data.signature, binding);
  return res.status(result.valid ? 200 : 422).json({
    valid: result.valid,
    reason: result.reason ?? null,
    did: claim.did,
    claimType: claim.claimType,
  });
});

export default router;
