import { HashService } from '../src/dashboard/hash.service';
import prisma from '../src/db/prisma';

// Mock Prisma
jest.mock('../src/db/prisma', () => ({
  hashSimulation: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
}));

describe('User Dashboard - Hash Function Demo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a SHA-256 hash', async () => {
    (prisma.hashSimulation.create as jest.Mock).mockResolvedValue({
      id: 'hash_1',
      studentId: 'student_1',
      inputData: 'hello world',
      hashType: 'SHA-256',
      hashValue: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9', // standard sha256 for 'hello world'
    });

    const result = await HashService.generateHash('student_1', 'hello world', 'SHA-256');
    expect(prisma.hashSimulation.create).toHaveBeenCalled();
    expect(result.hashType).toBe('SHA-256');
    expect(result.hashValue).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('should get simulations for a student', async () => {
    (prisma.hashSimulation.findMany as jest.Mock).mockResolvedValue([
      { hashValue: 'hash1' },
      { hashValue: 'hash2' },
    ]);

    const results = await HashService.getSimulations('student_1');
    expect(prisma.hashSimulation.findMany).toHaveBeenCalledWith({
      where: { studentId: 'student_1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(results.length).toBe(2);
  });
});
