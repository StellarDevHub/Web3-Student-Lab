import { Router } from 'express';

const router: ReturnType<typeof Router> = Router();

router.get('/resolve', (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : 'welcome';

  res.status(200).json({
    locale: req.locale ?? 'en',
    namespace: req.translationNamespace ?? 'platform',
    key,
    translation: req.t ? req.t(key) : key,
  });
});

export default router;
