import { Router, Request, Response } from 'express';
import { AuditService } from '../services/audit.service.js';
import { auditChainStore } from '../db/auditChainStore.js';
import { verifyPublishedAnchor } from '../jobs/anchorMerkleRootJob.js';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import { tamperEvidentAuditService } from '../services/tamperEvidentAuditService.js';

const router = Router();
const auditService = new AuditService();

router.post('/deploy', async (req: Request, res: Response) => {
    try {
        const { sessionId, ledgerSequence, action, payload } = req.body;

        if (!sessionId || ledgerSequence === undefined || !action) {
            return res.status(400).json({ error: 'Missing required audit fields: sessionId, ledgerSequence, action' });
        }

        const auditEntry = auditService.recordDeployment(sessionId, ledgerSequence, action, payload || {});
        return res.status(201).json({
            message: 'Deployment recorded securely in tamper-evident audit log',
            entry: auditEntry,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/verify', async (_req: Request, res: Response) => {
    try {
        const verificationResult = auditService.verifyChain();
        return res.status(200).json(verificationResult);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── Tamper-evident hash chain (BE-009) ──────────────────────────────────────

const serializeBigInts = (value: unknown) =>
    JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));

router.get('/chain/verify', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
    try {
        const result = await tamperEvidentAuditService.verifyChain();
        return res.status(result.valid ? 200 : 409).json(result);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/chain/anchors', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const anchors = await auditChainStore.listAnchors(limit);
        return res.status(200).json({ anchors: serializeBigInts(anchors) });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/chain/anchors/:id/verify', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
        const anchor = await auditChainStore.getAnchor(String(req.params.id));
        if (!anchor) {
            return res.status(404).json({ error: 'Anchor not found' });
        }
        const verification = await verifyPublishedAnchor(anchor);
        return res.status(verification.matches ? 200 : 409).json(serializeBigInts(verification));
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
