import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import {
  createFeedback,
  getFeedbackByCourse,
  getFeedbackByStudentAndCourse,
  updateFeedback,
  deleteFeedback,
  getCourseRatingSummary,
} from './feedback.service.js';
import { CreateFeedbackRequest, UpdateFeedbackRequest } from './types.js';

const router = Router();

/**
 * @route   POST /api/feedback
 * @desc    Submit or update feedback for a course
 * @access  Private (requires authentication)
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { courseId, rating, review }: CreateFeedbackRequest = req.body;

    // Validation
    if (!courseId || rating === undefined) {
      res.status(400).json({ error: 'Course ID and rating are required' });
      return;
    }

    const feedback = await createFeedback(studentId, {
      courseId,
      rating,
      review: review || undefined,
    });
    res.status(201).json(feedback);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Course not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (
        error.message ===
        'Student must be enrolled in the course to submit feedback'
      ) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (
        error.message.includes('Rating must be') ||
        error.message.includes('Review must be')
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

/**
 * @route   GET /api/feedback/course/:courseId
 * @desc    Get all feedback for a specific course
 * @access  Public
 */
router.get('/course/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const feedback = await getFeedbackByCourse(courseId);
    res.json(feedback);
  } catch (error) {
    if (error instanceof Error && error.message === 'Course not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

/**
 * @route   GET /api/feedback/course/:courseId/summary
 * @desc    Get rating summary for a course
 * @access  Public
 */
router.get('/course/:courseId/summary', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const summary = await getCourseRatingSummary(courseId);
    res.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === 'Course not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
});

/**
 * @route   GET /api/feedback/my-feedback/:courseId
 * @desc    Get current user's feedback for a specific course
 * @access  Private (requires authentication)
 */
router.get(
  '/my-feedback/:courseId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const studentId = req.user!.id;
      const { courseId } = req.params;

      const feedback = await getFeedbackByStudentAndCourse(studentId, courseId);

      if (!feedback) {
        res.status(404).json({ error: 'Feedback not found' });
        return;
      }

      res.json(feedback);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }
);

/**
 * @route   PUT /api/feedback/:courseId
 * @desc    Update existing feedback for a course
 * @access  Private (requires authentication)
 */
router.put('/:courseId', authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { courseId } = req.params;
    const { rating, review }: UpdateFeedbackRequest = req.body;

    // Validation
    if (rating === undefined && review === undefined) {
      res.status(400).json({ error: 'Rating or review is required' });
      return;
    }

    const feedback = await updateFeedback(studentId, courseId, {
      rating: rating || undefined,
      review: review || undefined,
    });
    res.json(feedback);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Feedback not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (
        error.message.includes('Rating must be') ||
        error.message.includes('Review must be')
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

/**
 * @route   DELETE /api/feedback/:courseId
 * @desc    Delete feedback for a course
 * @access  Private (requires authentication)
 */
router.delete(
  '/:courseId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const studentId = req.user!.id;
      const { courseId } = req.params;

      await deleteFeedback(studentId, courseId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Feedback not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  }
);

export default router;
