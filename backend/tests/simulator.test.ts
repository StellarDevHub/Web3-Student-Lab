import { VotingService } from '../src/simulator/voting.service';
import prisma from '../src/db/index';

// Mock Prisma client used by VotingService
jest.mock('../src/db/index', () => ({
  idea: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  vote: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
}));

describe('Blockchain Learning Simulator - Idea Voting Mechanism', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an idea', async () => {
    (prisma.idea.create as jest.Mock).mockResolvedValue({
      id: 'idea_1',
      title: 'Test Idea',
      description: 'A great idea',
    });

    const idea = await VotingService.createIdea('default', 'student_1', 'Test Idea', 'A great idea');
    expect(prisma.idea.create).toHaveBeenCalled();
    expect(idea.title).toBe('Test Idea');
  });

  it('should cast a vote', async () => {
    (prisma.vote.upsert as jest.Mock).mockResolvedValue({
      id: 'vote_1',
      ideaId: 'idea_1',
      studentId: 'student_1',
      value: 1,
    });

    const vote = await VotingService.castVote('idea_1', 'student_1', 1);
    expect(prisma.vote.upsert).toHaveBeenCalled();
    expect(vote.value).toBe(1);
  });

  it('should calculate idea score', async () => {
    (prisma.vote.findMany as jest.Mock).mockResolvedValue([
      { value: 1 },
      { value: 1 },
      { value: -1 },
    ]);

    const score = await VotingService.getIdeaScore('idea_1');
    expect(prisma.vote.findMany).toHaveBeenCalledWith({ where: { ideaId: 'idea_1' } });
    expect(score).toBe(1); // 1 + 1 - 1 = 1
  });
});
