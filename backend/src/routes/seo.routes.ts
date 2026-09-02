import { Router } from 'express';
import { simulatorSeoService } from '../services/seo/simulatorSeo.service.js';

const router: ReturnType<typeof Router> = Router();

router.get('/simulator/meta/:slug', async (req, res) => {
  const { slug } = req.params;
  const meta = await simulatorSeoService.getMetaTags(slug);

  if (!meta) {
    res.status(404).json({ error: `No simulator metadata found for slug: ${slug}` });
    return;
  }

  res.status(200).json({ slug, meta });
});

router.get('/simulator/sitemap', async (_req, res) => {
  const urls = await simulatorSeoService.getSitemapUrls();
  res.status(200).json({ count: urls.length, urls });
});

router.get('/simulator/cache-stats', (_req, res) => {
  res.status(200).json(simulatorSeoService.getCacheStats());
});

export default router;
