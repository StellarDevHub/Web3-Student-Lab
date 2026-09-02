import prisma from '../db/index.js';

export class VotingService {
  static async createIdea(workspaceId: string, studentId: string, title: string, description: string) {
    return prisma.idea.create({
      data: {
        workspaceId,
        studentId,
        title,
        description,
      },
    });
  }

  static async getIdeas(workspaceId: string) {
    return prisma.idea.findMany({
      where: { workspaceId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        votes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async castVote(ideaId: string, studentId: string, value: number) {
    // Upsert vote (1 for upvote, -1 for downvote)
    return prisma.vote.upsert({
      where: {
        ideaId_studentId: { ideaId, studentId },
      },
      update: {
        value,
      },
      create: {
        ideaId,
        studentId,
        value,
      },
    });
  }

  static async getIdeaScore(ideaId: string) {
    const votes = await prisma.vote.findMany({
      where: { ideaId },
    });
    return votes.reduce((acc, vote) => acc + vote.value, 0);
  }
}
