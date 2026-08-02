import { Router, type Request, type Response } from 'express';
import { RustValidationService } from '../services/rust-validation.js';

const router = Router();

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { code } = req.body ?? {};

    if (typeof code !== 'string') {
      res.status(400).json({ error: 'A code string is required' });
      return;
    }

    const result = await RustValidationService.validateCode(code);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Playground validation failed', details: String(error) });
  }
});

export default router;
