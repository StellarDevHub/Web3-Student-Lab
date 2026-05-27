import { Request, Response, Router } from 'express';
import { GeneratorService } from '../../generator/generator.service.js';
import logger from '../../utils/logger.js';
import { getRandomProjectIdea, mockProjectIdeas } from '../../generator/mockData.js';

const router = Router();
const generatorService = new GeneratorService();

/**
 * @route   POST /api/generator/generate
 * @desc    Generate a new project idea using AI (with mock data fallback)
 * @access  Public
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { theme, techStack, difficulty } = req.body;

    if (!theme || !techStack || !difficulty) {
      res.status(400).json({ error: 'Theme, techStack, and difficulty are required' });
      return;
    }

    // Try AI generation first, fallback to mock data if it fails
    try {
      const projectIdea = await generatorService.generateProjectIdea(theme, techStack, difficulty);
      res.json({ projectIdea });
    } catch (aiError) {
      logger.warn(`AI generation failed, using mock data: ${aiError}`);
      // Return a random mock project idea as fallback
      const projectIdea = getRandomProjectIdea();
      res.json({ projectIdea, fromMock: true });
    }
  } catch (error) {
    logger.error(`Generator Route Error: ${error}`);
    res.status(500).json({ error: 'Failed to generate project idea' });
  }
});

/**
 * @route   GET /api/generator/mock-ideas
 * @desc    Get all mock project ideas (for frontend development)
 * @access  Public
 */
router.get('/mock-ideas', (_req: Request, res: Response) => {
  res.json({ ideas: mockProjectIdeas });
});

export default router;
