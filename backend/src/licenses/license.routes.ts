/**
 * Open Source License Guide - Express Routes
 *
 * REST API endpoints for the Open Source License Guide module.
 * All endpoints are accessible under /api/v1/licenses.
 */
import { Request, Response, Router } from 'express';
import logger from '../utils/logger.js';
import { getQueryBoolean, getQueryInt } from '../utils/queryParams.js';
import * as licenseService from './license.service.js';

const router: ReturnType<typeof Router> = Router();

const getQueryString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

/**
 * @openapi
 * /api/v1/licenses:
 *   get:
 *     summary: List all open source licenses with optional filtering
 *     description: Returns a paginated list of open source licenses. Supports filtering by category, use case, search text, permissions, and conditions.
 *     tags: [Licenses]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [permissive, copyleft, weak-copyleft, network-copyleft, public-domain, other]
 *       - in: query
 *         name: useCase
 *         schema:
 *           type: string
 *           enum: [personal, commercial, saas, library, documentation, educational]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: allowsCommercial
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: allowsModification
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: requiresDisclosure
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: requiresSameLicense
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: A paginated list of licenses
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const category = getQueryString(req.query.category);
    const useCase = getQueryString(req.query.useCase);
    const search = getQueryString(req.query.search);
    const popularity = getQueryString(req.query.popularity);
    const tags = getQueryString(req.query.tags);


    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (useCase) filter.useCase = useCase;
    if (search) filter.search = search;
    if (req.query.allowsCommercial !== undefined) {
      filter.allowsCommercial = getQueryBoolean(req.query.allowsCommercial);
    }
    if (req.query.allowsModification !== undefined) {
      filter.allowsModification = getQueryBoolean(req.query.allowsModification);
    }
    if (req.query.requiresDisclosure !== undefined) {
      filter.requiresDisclosure = getQueryBoolean(req.query.requiresDisclosure);
    }
    if (req.query.requiresSameLicense !== undefined) {
      filter.requiresSameLicense = getQueryBoolean(req.query.requiresSameLicense);
    }
    if (popularity) filter.popularity = popularity;
    if (tags) filter.tags = tags.split(',');

    const pageNum = Math.max(1, getQueryInt(req.query.page, 1));
    const limitNum = Math.min(100, Math.max(1, getQueryInt(req.query.limit, 50)));


    const result = licenseService.getLicenses(
      Object.keys(filter).length > 0 ? (filter as any) : undefined,
      pageNum,
      limitNum
    );
    res.json(result);
  } catch (error) {
    logger.error('Error fetching licenses:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch licenses' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/meta:
 *   get:
 *     summary: Get license guide metadata
 *     tags: [Licenses]
 *     responses:
 *       200:
 *         description: Guide metadata including total count, categories, and version
 */
router.get('/meta', (_req: Request, res: Response) => {
  try {
    const result = licenseService.getGuideMeta();
    res.json(result);
  } catch (error) {
    logger.error('Error fetching license guide meta:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch guide metadata' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/categories:
 *   get:
 *     summary: Get all license categories with counts
 *     tags: [Licenses]
 *     responses:
 *       200:
 *         description: List of categories with license counts
 */
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const result = licenseService.getCategories();
    res.json(result);
  } catch (error) {
    logger.error('Error fetching license categories:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch categories' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/by-category:
 *   get:
 *     summary: Get licenses grouped by category
 *     tags: [Licenses]
 *     responses:
 *       200:
 *         description: Licenses grouped by their category
 */
router.get('/by-category', (_req: Request, res: Response) => {
  try {
    const result = licenseService.getLicensesByCategory();
    res.json(result);
  } catch (error) {
    logger.error('Error fetching licenses by category:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch licenses by category' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/use-cases:
 *   get:
 *     summary: Get all use cases with guidance and top picks
 *     tags: [Licenses]
 *     responses:
 *       200:
 *         description: All use cases with recommendations
 */
router.get('/use-cases', (_req: Request, res: Response) => {
  try {
    const result = licenseService.getAllUseCases();
    res.json(result);
  } catch (error) {
    logger.error('Error fetching use cases:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch use cases' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/recommend/{useCase}:
 *   get:
 *     summary: Get license recommendations for a specific use case
 *     tags: [Licenses]
 *     parameters:
 *       - in: path
 *         name: useCase
 *         required: true
 *         schema:
 *           type: string
 *           enum: [personal, commercial, saas, library, documentation, educational]
 *     responses:
 *       200:
 *         description: Recommended licenses for the given use case
 *       400:
 *         description: Invalid use case
 */
router.get('/recommend/:useCase', (req: Request, res: Response) => {
  try {
    const useCase = getQueryString(req.params.useCase);
    const validUseCases = ['personal', 'commercial', 'saas', 'library', 'documentation', 'educational'];
    if (!useCase || !validUseCases.includes(useCase)) {
      res.status(400).json({ status: 'error', error: `Invalid use case '${useCase ?? 'undefined'}'. Valid values: ${validUseCases.join(', ')}` });
      return;
    }
    const result = licenseService.getRecommendations(useCase as any);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching recommendations:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch recommendations' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/quick-recommend:
 *   get:
 *     summary: Quick license recommendation based on simple questionnaire
 *     tags: [Licenses]
 *     parameters:
 *       - in: query
 *         name: wantsCommercial
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: wantsModifications
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: wantsPatentProtection
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: acceptsCopyleft
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: isLibrary
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Sorted list of recommended licenses
 */
router.get('/quick-recommend', (req: Request, res: Response) => {
  try {
    const result = licenseService.quickRecommend(
      getQueryBoolean(req.query.wantsCommercial, true),
      getQueryBoolean(req.query.wantsModifications, true),
      getQueryBoolean(req.query.wantsPatentProtection, false),
      getQueryBoolean(req.query.acceptsCopyleft, false),
      getQueryBoolean(req.query.isLibrary, false)
    );
    res.json(result);
  } catch (error) {
    logger.error('Error in quick recommend:', error);
    res.status(500).json({ status: 'error', error: 'Failed to get quick recommendations' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/compare:
 *   get:
 *     summary: Compare two licenses side by side
 *     tags: [Licenses]
 *     parameters:
 *       - in: query
 *         name: a
 *         required: true
 *         schema:
 *           type: string
 *         description: First license ID
 *       - in: query
 *         name: b
 *         required: true
 *         schema:
 *           type: string
 *         description: Second license ID
 *     responses:
 *       200:
 *         description: Detailed comparison between two licenses
 *       400:
 *         description: Missing or invalid license IDs
 */
router.get('/compare', (req: Request, res: Response) => {
  try {
    const a = getQueryString(req.query.a);
    const b = getQueryString(req.query.b);

    if (!a || !b) {
      res.status(400).json({ status: 'error', error: 'Both license IDs (a and b) are required' });
      return;
    }

    const result = licenseService.compareLicenses(a, b);
    if (result.status === 'error') {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('Error comparing licenses:', error);
    res.status(500).json({ status: 'error', error: 'Failed to compare licenses' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/compatibility:
 *   get:
 *     summary: Check compatibility between two licenses
 *     tags: [Licenses]
 *     parameters:
 *       - in: query
 *         name: a
 *         required: true
 *         schema:
 *           type: string
 *         description: First license ID
 *       - in: query
 *         name: b
 *         required: true
 *         schema:
 *           type: string
 *         description: Second license ID
 *     responses:
 *       200:
 *         description: Compatibility status between two licenses
 */
router.get('/compatibility', (req: Request, res: Response) => {
  try {
    const a = getQueryString(req.query.a);
    const b = getQueryString(req.query.b);

    if (!a || !b) {
      res.status(400).json({ status: 'error', error: 'Both license IDs (a and b) are required' });
      return;
    }

    const result = licenseService.checkCompatibility(a, b);
    if (result.status === 'error') {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('Error checking compatibility:', error);
    res.status(500).json({ status: 'error', error: 'Failed to check compatibility' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/:licenseId/compatible:
 *   get:
 *     summary: Find all licenses compatible with a given license
 *     tags: [Licenses]
 *     parameters:
 *       - in: path
 *         name: licenseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of licenses with compatibility status
 */
router.get('/:licenseId/compatible', (req: Request, res: Response) => {
  try {
    const licenseId = getQueryString(req.params.licenseId);
    if (!licenseId) {
      return res.status(400).json({ status: 'error', error: 'licenseId is required' });
    }
    const result = licenseService.getCompatibleLicenses(licenseId);

    if (result.status === 'error') {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('Error fetching compatible licenses:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch compatible licenses' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/spdx/{spdxId}:
 *   get:
 *     summary: Get a license by its SPDX identifier
 *     tags: [Licenses]
 *     parameters:
 *       - in: path
 *         name: spdxId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: License details
 *       404:
 *         description: License not found
 */
router.get('/spdx/:spdxId', (req: Request, res: Response) => {
  try {
    const spdxId = getQueryString(req.params.spdxId);
    if (!spdxId) {
      return res.status(400).json({ status: 'error', error: 'spdxId is required' });
    }
    const result = licenseService.getLicenseBySpdxId(spdxId);

    if (result.status === 'error') {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('Error fetching license by SPDX ID:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch license' });
  }
});

/**
 * @openapi
 * /api/v1/licenses/{licenseId}:
 *   get:
 *     summary: Get a single license by its ID
 *     tags: [Licenses]
 *     parameters:
 *       - in: path
 *         name: licenseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: License details
 *       404:
 *         description: License not found
 */
router.get('/:licenseId', (req: Request, res: Response) => {
  try {
    const licenseId = getQueryString(req.params.licenseId);
    if (!licenseId) {
      return res.status(400).json({ status: 'error', error: 'licenseId is required' });
    }
    const result = licenseService.getLicenseById(licenseId);

    if (result.status === 'error') {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error('Error fetching license:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch license' });
  }
});

export default router;
