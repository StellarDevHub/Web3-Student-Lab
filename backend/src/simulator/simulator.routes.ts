import { Router } from 'express';
import * as votingController from './voting.controller.js';

const router: ReturnType<typeof Router> = Router();

// Idea Voting Mechanism Routes
router.post('/ideas', votingController.createIdea);
router.get('/ideas', votingController.getIdeas);
router.post('/ideas/:ideaId/vote', votingController.castVote);

export default router;
