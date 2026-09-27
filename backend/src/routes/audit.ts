import { Router, Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

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

export default router;
