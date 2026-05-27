import { PrismaClient } from '@prisma/client';
import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// Apply auth middleware to all canvas routes
router.use(authenticate);

// GET /api/canvas - List all user's canvases
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const canvases = await prisma.canvas.findMany({
      where: {
        OR: [{ studentId: userId }, { collaborators: { has: userId } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        roomId: true,
        title: true,
        description: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        lastModifiedBy: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json(canvases);
  } catch (error) {
    console.error('Error fetching canvases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/canvas - Create new canvas
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { roomId, title, description, isPublic } = req.body;

    if (!roomId || !title) {
      return res.status(400).json({ error: 'Room ID and title are required' });
    }

    // Check if room ID already exists
    const existing = await prisma.canvas.findUnique({
      where: { roomId },
    });

    if (existing) {
      return res.status(409).json({ error: 'Room ID already exists' });
    }

    const canvas = await prisma.canvas.create({
      data: {
        roomId,
        title,
        description,
        isPublic: isPublic || false,
        studentId: userId,
        data: {},
      },
    });

    res.status(201).json(canvas);
  } catch (error) {
    console.error('Error creating canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/canvas/room/:roomId - Get canvas by roomId
router.get('/room/:roomId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { roomId } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { roomId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    const hasAccess =
      canvas.studentId === userId || canvas.collaborators.includes(userId || '') || canvas.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(canvas);
  } catch (error) {
    console.error('Error fetching canvas by roomId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/canvas/:id - Get specific canvas
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check access: owner or collaborator or public
    const hasAccess =
      canvas.studentId === userId || canvas.collaborators.includes(userId || '') || canvas.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(canvas);
  } catch (error) {
    console.error('Error fetching canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/canvas/:id - Update canvas
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { title, description, data, isPublic } = req.body;

    const canvas = await prisma.canvas.findUnique({
      where: { id },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check ownership
    if (canvas.studentId !== userId) {
      return res.status(403).json({ error: 'Only owner can update' });
    }

    const updated = await prisma.canvas.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(data && { data }),
        ...(isPublic !== undefined && { isPublic }),
        lastModifiedBy: userId,
        lastModifiedAt: new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/canvas/:id - Delete canvas
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { id },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check ownership
    if (canvas.studentId !== userId) {
      return res.status(403).json({ error: 'Only owner can delete' });
    }

    await prisma.canvas.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/canvas/:id/collaborators - Add collaborator
router.post('/:id/collaborators', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { collaboratorId } = req.body;

    if (!collaboratorId) {
      return res.status(400).json({ error: 'Collaborator ID is required' });
    }

    const canvas = await prisma.canvas.findUnique({
      where: { id },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check ownership
    if (canvas.studentId !== userId) {
      return res.status(403).json({ error: 'Only owner can add collaborators' });
    }

    // Add collaborator if not already present
    const collaborators = canvas.collaborators || [];
    if (!collaborators.includes(collaboratorId)) {
      collaborators.push(collaboratorId);
    }

    const updated = await prisma.canvas.update({
      where: { id },
      data: {
        collaborators,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error adding collaborator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/canvas/:id/collaborators/:collaboratorId - Remove collaborator
router.delete('/:id/collaborators/:collaboratorId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id, collaboratorId } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { id },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check ownership
    if (canvas.studentId !== userId) {
      return res.status(403).json({ error: 'Only owner can remove collaborators' });
    }

    const collaborators = (canvas.collaborators || []).filter(
      (collab) => collab !== collaboratorId
    );

    const updated = await prisma.canvas.update({
      where: { id },
      data: {
        collaborators,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/canvas/:id/export - Export canvas data
router.post('/:id/export', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { id },
    });

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Check access: owner or collaborator or public
    const hasAccess =
      canvas.studentId === userId || canvas.collaborators.includes(userId || '') || canvas.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Return canvas data for export
    res.json({
      id: canvas.id,
      roomId: canvas.roomId,
      title: canvas.title,
      description: canvas.description,
      data: canvas.data,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      creator: canvas.student,
    });
  } catch (error) {
    console.error('Error exporting canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
