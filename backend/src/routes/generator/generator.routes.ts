
import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { GeneratorService, InvalidGeneratedIdeaError } from '../../generator/generator.service.js';
import { getRandomProjectIdea, mockProjectIdeas } from '../../generator/mockData.js';
import { storageService } from '../../services/storage/index.js';
import prisma from '../../db/index.js';
import { createVestingScheduleSchema, claimVestingTokensSchema } from './vesting.validation.js';
import { validate } from '../../middleware/validation.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();
const generatorService = new GeneratorService();
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * @route   POST /api/generator/generate
 * @desc    Generate a new project idea using AI (with mock data fallback)
 * @access  Public
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      theme,
      techStack,
      difficulty,
      persistToStorage,
      queuedPersist,
      customRpcUrl,
    } = req.body;

    const fail400 = (message: string, field?: string) => {
      const payload: Record<string, unknown> = { error: message };
      if (field) payload.field = field;
      res.status(400).json(payload);
    };

    // Validate required inputs
    if (typeof theme !== 'string' || !theme.trim()) {
      fail400('Theme is required and must be a non-empty string', 'theme');
      return;
    }

    if (!Array.isArray(techStack) || techStack.length === 0) {
      fail400('techStack is required and must be a non-empty array', 'techStack');
      return;
    }

    const techStackClean = techStack
      .filter((v: unknown) => typeof v === 'string')
      .map((v: string) => v.trim())
      .filter(Boolean);

    if (techStackClean.length === 0) {
      fail400('techStack must contain at least one non-empty string', 'techStack');
      return;
    }

    const difficultyAllowed = new Set(['Beginner', 'Intermediate', 'Advanced']);
    if (!difficultyAllowed.has(difficulty)) {
      fail400('difficulty must be one of Beginner, Intermediate, Advanced', 'difficulty');
      return;
    }

    // Validate optional custom RPC URL
    let normalizedCustomRpcUrl: string | undefined;
    if (customRpcUrl !== undefined && customRpcUrl !== null) {
      if (typeof customRpcUrl !== 'string') {
        fail400('customRpcUrl must be a string if provided', 'customRpcUrl');
        return;
      }

      const trimmed = customRpcUrl.trim();
      if (!trimmed) {
        fail400('customRpcUrl cannot be empty', 'customRpcUrl');
        return;
      }

      // Prevent prompt-abuse with extremely long URLs
      if (trimmed.length > 2048) {
        fail400('customRpcUrl is too long', 'customRpcUrl');
        return;
      }

      let url: URL;
      try {
        url = new URL(trimmed);
      } catch {
        fail400('customRpcUrl is not a valid URL', 'customRpcUrl');
        return;
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        fail400('customRpcUrl must use http or https', 'customRpcUrl');
        return;
      }

      // Normalize: drop trailing slash to keep deterministic prompt and downstream usage
      url.pathname = url.pathname.replace(/\/$/, '');

      // Defensive: strip credentials from URL (username:password@host)
      url.username = '';
      url.password = '';

      normalizedCustomRpcUrl = url.toString();
    }

    // Try AI generation first, fallback to mock data if it fails
    try {
      const projectIdea = await generatorService.generateProjectIdea(
        theme.trim(),
        techStackClean,
        difficulty,
        normalizedCustomRpcUrl
      );

      if (persistToStorage) {
        const projectId = `${slugify(theme.trim())}-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const storageResult = queuedPersist
          ? await storageService.pinProjectIdea({
              projectId,
              content: projectIdea as any,
              queued: true,
            })
          : await storageService.pinProjectIdea({
              projectId,
              content: projectIdea as any,
            });

        res.json({
          projectIdea,
          storage: storageResult,
        });
        return;
      }

      res.json({ projectIdea });
    } catch (aiError) {
      // Both "AI backend unreachable" and "model output failed
      // validation/safety checks" land here. Either way we never pass
      // through unvalidated model output — we substitute a known-safe
      // mock idea and tell the frontend an actionable reason (#908).
      const isValidationFailure = aiError instanceof InvalidGeneratedIdeaError;
      const fallbackReason = isValidationFailure
        ? 'generated_idea_rejected'
        : 'ai_service_unavailable';
      const fallbackMessage = isValidationFailure
        ? 'The generated idea did not meet our content/format requirements, so we substituted a safe example idea instead.'
        : 'The AI idea generator is temporarily unavailable, so we substituted a safe example idea instead.';

      logger.warn(`AI generation failed (${fallbackReason}), using mock data: ${aiError}`);
      // Return a random mock project idea as fallback
      const projectIdea = getRandomProjectIdea();
      if (persistToStorage) {
        const projectId = `mock-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const storageResult = queuedPersist
          ? await storageService.pinProjectIdea({
              projectId,
              content: projectIdea as any,
              queued: true,
            })
          : await storageService.pinProjectIdea({
              projectId,
              content: projectIdea as any,
            });

        res.json({
          projectIdea,
          fromMock: true,
          fallbackReason,
          message: fallbackMessage,
          storage: storageResult,
        });
        return;
      }

      res.json({ projectIdea, fromMock: true, fallbackReason, message: fallbackMessage });
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

/**
 * @route   POST /api/generator/vesting
 * @desc    Create a new vesting schedule
 * @access  Public
 */
router.post('/vesting', validate(createVestingScheduleSchema), async (req: Request, res: Response) => {
  try {
    const { projectId, tokenName, tokenSymbol, amount, cliffMonths, durationMonths, beneficiary } = req.body;

    const existing = await prisma.vestingSchedule.findUnique({
      where: { projectId }
    });
    if (existing) {
      res.status(400).json({ error: 'Vesting schedule already exists for this project' });
      return;
    }

    const schedule = await prisma.vestingSchedule.create({
      data: {
        projectId,
        tokenName,
        tokenSymbol,
        amount,
        cliffMonths,
        durationMonths,
        beneficiary,
        claimedAmount: 0
      }
    });

    res.status(201).json(schedule);
  } catch (error) {
    logger.error(`Create Vesting Schedule Error: ${error}`);
    res.status(500).json({ error: 'Failed to create vesting schedule' });
  }
});

/**
 * @route   GET /api/generator/vesting
 * @desc    Get all vesting schedules
 * @access  Public
 */
router.get('/vesting', async (req: Request, res: Response) => {
  try {
    const schedules = await prisma.vestingSchedule.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(schedules);
  } catch (error) {
    logger.error(`List Vesting Schedules Error: ${error}`);
    res.status(500).json({ error: 'Failed to retrieve vesting schedules' });
  }
});

/**
 * @route   GET /api/generator/vesting/:projectId
 * @desc    Get vesting schedule by project ID
 * @access  Public
 */
router.get('/vesting/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }
    const schedule = await prisma.vestingSchedule.findUnique({
      where: { projectId }
    });
    if (!schedule) {
      res.status(404).json({ error: 'Vesting schedule not found' });
      return;
    }
    res.json(schedule);
  } catch (error) {
    logger.error(`Get Vesting Schedule Error: ${error}`);
    res.status(500).json({ error: 'Failed to retrieve vesting schedule' });
  }
});

/**
 * @route   POST /api/generator/vesting/:projectId/claim
 * @desc    Claim vesting tokens (simulated or real-time)
 * @access  Public
 */
router.post('/vesting/:projectId/claim', validate(claimVestingTokensSchema), async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }
    const { amount: claimAmount } = req.body;
    const simulatedMonths = req.body.simulatedMonthsElapsed !== undefined ? Number(req.body.simulatedMonthsElapsed) : null;

    const schedule = await prisma.vestingSchedule.findUnique({
      where: { projectId }
    });
    if (!schedule) {
      res.status(404).json({ error: 'Vesting schedule not found' });
      return;
    }

    let vestedAmount = 0;
    if (simulatedMonths !== null) {
      if (simulatedMonths >= schedule.durationMonths) {
        vestedAmount = schedule.amount;
      } else if (simulatedMonths < schedule.cliffMonths) {
        vestedAmount = 0;
      } else {
        vestedAmount = schedule.amount * (simulatedMonths / schedule.durationMonths);
      }
    } else {
      const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;
      const timeElapsedMs = Date.now() - schedule.createdAt.getTime();
      const cliffMs = schedule.cliffMonths * MONTH_IN_MS;
      const durationMs = schedule.durationMonths * MONTH_IN_MS;

      if (timeElapsedMs >= durationMs) {
        vestedAmount = schedule.amount;
      } else if (timeElapsedMs < cliffMs) {
        vestedAmount = 0;
      } else {
        vestedAmount = schedule.amount * (timeElapsedMs / durationMs);
      }
    }

    const claimableAmount = Math.max(0, vestedAmount - schedule.claimedAmount);

    if (claimAmount > claimableAmount) {
      res.status(400).json({
        error: `Requested claim amount ${claimAmount} exceeds claimable amount ${claimableAmount.toFixed(2)}`
      });
      return;
    }

    const updatedSchedule = await prisma.vestingSchedule.update({
      where: { projectId },
      data: {
        claimedAmount: {
          increment: claimAmount
        }
      }
    });

    res.json(updatedSchedule);
  } catch (error) {
    logger.error(`Claim Vesting Tokens Error: ${error}`);
    res.status(500).json({ error: 'Failed to process token claim' });
  }
});

export default router;
