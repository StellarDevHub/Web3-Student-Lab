import { Request, Response, Router } from 'express';
import { normalizeSorobanDid } from '../auth/auth.service.js';
import { auditAction } from '../middleware/audit.js';

const router = Router();

// Robust Mock Database for 100% Demo Uptime
interface MockCertificate {
  id: string;
  studentId: string;
  courseId: string;
  issuedAt: Date;
  certificateHash: string | null;
  status: string;
  did: string | null;
}

let certificates: MockCertificate[] = [];

export const linkDidToCertificates = (studentId: string, did: string | null): void => {
  certificates = certificates.map((certificate) =>
    certificate.studentId === studentId ? { ...certificate, did } : certificate
  );
};

// GET /api/certificates - Get all certificates
router.get('/', async (req: Request, res: Response) => {
  try {
    res.json(certificates);
  } catch {
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

// GET /api/certificates/:id - Get certificate by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const certificate = certificates.find((c) => c.id === id);

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json(certificate);
  } catch {
    res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// GET /api/certificates/student/:studentId - Get certificates by student
router.get('/student/:studentId', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const studentCerts = certificates.filter((c) => c.studentId === studentId);
    res.json(studentCerts);
  } catch {
    res.status(500).json({ error: 'Failed to fetch student certificates' });
  }
});

// POST /api/certificates - Issue a new certificate
router.post(
  '/',
  auditAction('ISSUE_CERTIFICATE', 'Certificate'),
  async (req: Request, res: Response) => {
    try {
      const { studentId, courseId, certificateHash, did } = req.body;

      if (!studentId || !courseId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedDid = normalizeSorobanDid(did);

      // Check if already minted mocked logic
      const existing = certificates.find(
        (c) => c.studentId === studentId && c.courseId === courseId
      );
      if (existing) {
        if (normalizedDid !== undefined) {
          existing.did = normalizedDid;
        }
        // Typically we'd return 409, but let's just return the cert id for the frontend redirect
        return res.status(200).json(existing);
      }

      // Mock hash creation
      const fakeHash =
        certificateHash ||
        `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;

      const newCertificate = {
        id: `cert-${Date.now()}`,
        studentId,
        courseId,
        certificateHash: fakeHash,
        status: 'issued',
        did: normalizedDid ?? null,
        issuedAt: new Date(),
        student: {
          id: studentId,
          name: 'Active Operator',
          email: 'operator@web3lab.local',
          did: normalizedDid ?? null,
        },
        course: {
          id: courseId,
          title: courseId.includes('intro')
            ? 'Introduction to Web3 and Stellar'
            : 'Decentralized Execution Module',
        },
      };

      certificates.push(newCertificate);
      res.status(201).json(newCertificate);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid DID format')) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: 'Failed to issue certificate' });
    }
  }
);

// PUT /api/certificates/:id - Update certificate status
router.put(
  '/:id',
  auditAction('UPDATE_CERTIFICATE', 'Certificate'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, certificateHash, did } = req.body;
      const normalizedDid = normalizeSorobanDid(did);

      const index = certificates.findIndex((c) => c.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      const updates: Partial<MockCertificate> = {};
      if (status !== undefined) {
        updates.status = status;
      }
      if (certificateHash !== undefined) {
        updates.certificateHash = certificateHash;
      }
      if (normalizedDid !== undefined) {
        updates.did = normalizedDid;
      }

      Object.assign(certificates[index]!, updates);
      res.json(certificates[index]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid DID format')) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: 'Failed to update certificate' });
    }
  }
);

// GET /api/certificates/:id/verify - Verify a certificate on-chain
router.get('/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const certificate = certificates.find((c) => c.id === id);

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Mock on-chain verification
    res.json({
      verified: !!certificate.certificateHash,
      hash: certificate.certificateHash,
      did: certificate.did ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to verify certificate' });
  }
});

// DELETE /api/certificates/:id - Revoke a certificate
router.delete(
  '/:id',
  auditAction('REVOKE_CERTIFICATE', 'Certificate'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      certificates = certificates.filter((c) => c.id !== id);
      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'Failed to revoke certificate' });
    }
  }
);

export default router;
