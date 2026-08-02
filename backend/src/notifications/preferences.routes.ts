import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import {
  NotificationPreferencesService,
  type CreatePreferencesDto,
  type UpdatePreferencesDto,
} from './preferences.service.js';
import { validateBody } from '../utils/validation.js';
import { z } from 'zod';

const router = Router();
const preferencesService = NotificationPreferencesService.getInstance();

const createSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  courseUpdates: z.boolean().optional(),
  announcements: z.boolean().optional(),
  newCourses: z.boolean().optional(),
  reminders: z.boolean().optional(),
  frequency: z.enum(['immediate', 'daily', 'weekly']).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

const updateSchema = createSchema.partial();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const prefs = await preferencesService.getByStudentId(studentId);

    if (!prefs) {
      return res.status(404).json({ error: 'Notification preferences not found' });
    }

    res.json(prefs);
  } catch (error) {
    console.error('Failed to fetch notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

router.post('/', authenticate, validateBody(createSchema), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const dto: CreatePreferencesDto = {
      studentId,
      ...req.body,
    };

    const prefs = await preferencesService.create(dto);
    res.status(201).json(prefs);
  } catch (error: any) {
    console.error('Failed to create notification preferences:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Notification preferences already exist' });
    }
    res.status(500).json({ error: 'Failed to create notification preferences' });
  }
});

router.put('/', authenticate, validateBody(updateSchema), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const dto: UpdatePreferencesDto = {
      studentId,
      ...req.body,
    };

    const prefs = await preferencesService.upsert(dto);
    res.json(prefs);
  } catch (error) {
    console.error('Failed to update notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

router.patch('/', authenticate, validateBody(updateSchema), async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const dto: UpdatePreferencesDto = {
      studentId,
      ...req.body,
    };

    const prefs = await preferencesService.update(studentId, dto);
    res.json(prefs);
  } catch (error: any) {
    console.error('Failed to patch notification preferences:', error);
    if (error.message === 'Notification preferences not found') {
      return res.status(404).json({ error: 'Notification preferences not found' });
    }
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

router.delete('/', authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    await preferencesService.delete(studentId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Failed to delete notification preferences:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Notification preferences not found' });
    }
    res.status(500).json({ error: 'Failed to delete notification preferences' });
  }
});

export default router;
