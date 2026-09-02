import { Router, type Request, type Response } from 'express';
import { RustValidationService } from '../services/rust-validation.js';

const router: ReturnType<typeof Router> = Router();

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { code } = req.body ?? {};

    if (typeof code !== 'string') {
      res.status(400).json({ error: 'A code string is required' });
      return;
    }

    const result = await RustValidationService.validateCode(code);
    if (result.status === 'rejected') {
      res.status(413).json(result);
      return;
    }

    if (result.status === 'timed_out') {
      res.status(422).json(result);
      return;
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Playground validation failed' });
  }
});

export default router;
