import { Request, Response } from 'express';
import { VotingService } from './voting.service.js';
import { getQueryString } from '../utils/queryParams.js';

export const createIdea = async (req: Request, res: Response) => {
  try {
    const { workspaceId, studentId, title, description } = req.body;
    if (!studentId || !title || !description) {
      return res.status(400).json({ success: false, error: 'studentId, title, and description are required' });
    }
    const idea = await VotingService.createIdea(workspaceId || 'default', studentId, title, description);
    res.status(201).json({ success: true, data: idea });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getIdeas = async (req: Request, res: Response) => {
  try {
    const workspaceId = getQueryString(req.query.workspaceId, 'default');

    const ideas = await VotingService.getIdeas(workspaceId);

    // Calculate score for each idea
    const ideasWithScores = ideas.map(idea => {
      const score = idea.votes.reduce((acc, vote) => acc + vote.value, 0);
      return { ...idea, score };
    });

    res.json({ success: true, data: ideasWithScores });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const castVote = async (req: Request, res: Response) => {
  try {
    const ideaId = getQueryString(req.params.ideaId);

    const { studentId, value } = req.body;
    if (!ideaId || !studentId || (value !== 1 && value !== -1)) {
      return res.status(400).json({ success: false, error: 'Valid studentId and vote value (1 or -1) are required' });
    }
    const vote = await VotingService.castVote(ideaId, studentId, value);
    res.json({ success: true, data: vote });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
