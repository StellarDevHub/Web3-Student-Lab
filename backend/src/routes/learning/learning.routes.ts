import { Router, Request, Response } from 'express';
import { Module, Lesson, Progress } from './types.js';

const router = Router();

// Mock data
const modules: Module[] = [
  {
    id: 'mod-1',
    title: 'Blockchain Fundamentals',
    description: 'Learn the basics of blockchain technology',
    lessons: [
      {
        id: 'lesson-1',
        title: 'What is Blockchain?',
        description: 'Introduction to distributed ledger technology',
        difficulty: 'beginner',
        completed: false,
      },
      {
        id: 'lesson-2',
        title: 'How Transactions Work',
        description: 'Understanding transaction flow in blockchain',
        difficulty: 'beginner',
        completed: false,
      },
    ],
  },
  {
    id: 'mod-2',
    title: 'Smart Contracts',
    description: 'Introduction to smart contracts and Soroban',
    lessons: [
      {
        id: 'lesson-3',
        title: 'Smart Contract Basics',
        description: 'What are smart contracts and how they work',
        difficulty: 'intermediate',
        completed: false,
      },
      {
        id: 'lesson-4',
        title: 'Writing Soroban Contracts',
        description: 'Learn to write smart contracts in Rust',
        difficulty: 'intermediate',
        completed: false,
      },
    ],
  },
];

// Mock user progress storage
const userProgress: Map<string, Progress> = new Map();

/**
 * @route   GET /api/learning/modules
 * @desc    Get all learning modules
 * @access  Public
 */
router.get('/modules', (req: Request, res: Response) => {
  try {
    const difficulty = req.query.difficulty as string | undefined;

    let filteredModules = modules;

    if (difficulty) {
      filteredModules = modules.map((mod) => ({
        ...mod,
        lessons: mod.lessons.filter(
          (lesson: Lesson) => lesson.difficulty === difficulty
        ),
      }));
    }

    res.json({ modules: filteredModules });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/learning/modules/:moduleId
 * @desc    Get a specific module by ID
 * @access  Public
 */
router.get('/modules/:moduleId', (req: Request, res: Response) => {
  try {
    const moduleId = req.params.moduleId as string;
    const module = modules.find((m) => m.id === moduleId);

    if (!module) {
      res.status(404).json({ error: 'Module not found' });
      return;
    }

    res.json({ module });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/learning/progress/:userId
 * @desc    Get user learning progress
 * @access  Public
 */
router.get('/progress/:userId', (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const progress = userProgress.get(userId);

    if (!progress) {
      // Return default progress if user has no progress yet
      res.json({
        progress: {
          userId,
          completedLessons: [],
          currentModule: 'mod-1',
          percentage: 0,
        },
      });
      return;
    }

    res.json({ progress });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/learning/progress/:userId/complete
 * @desc    Mark a lesson as complete
 * @access  Public
 */
router.post('/progress/:userId/complete', (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { lessonId } = req.body;

    if (!lessonId) {
      res.status(400).json({ error: 'Lesson ID is required' });
      return;
    }

    // Verify lesson exists
    const lessonExists = modules.some((mod) =>
      mod.lessons.some((l: Lesson) => l.id === lessonId)
    );

    if (!lessonExists) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    // Get or create user progress
    let progress = userProgress.get(userId);

    if (!progress) {
      progress = {
        userId,
        completedLessons: [],
        currentModule: 'mod-1',
        percentage: 0,
      };
    }

    // Mark lesson as complete if not already
    if (!progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);

      // Calculate new percentage
      const totalLessons = modules.reduce(
        (acc, mod) => acc + mod.lessons.length,
        0
      );
      progress.percentage = Math.round(
        (progress.completedLessons.length / totalLessons) * 100
      );
    }

    userProgress.set(userId, progress);

    res.json({ progress, message: 'Lesson marked as complete' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
