import { Router } from 'express';
import { exportAsJSON, exportAsCSV } from '../services/contributionExportService.js';

const router = Router();

// GET /export/contributions/:userId/json
router.get('/contributions/:userId/json', (req, res) => {
  const { userId } = req.params;
  const data = exportAsJSON(userId);
  res.json(data);
});

// GET /export/contributions/:userId/csv
router.get('/contributions/:userId/csv', (req, res) => {
  const { userId } = req.params;
  const csv = exportAsCSV(userId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="contributions-${userId}.csv"`);
  res.send(csv);
});

export default router;
