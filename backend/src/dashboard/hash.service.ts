import prisma from '../db/index.js';
import crypto from 'crypto';

export class HashService {
  static async generateHash(studentId: string, inputData: string, hashType: string = 'SHA-256') {
    let hashValue = '';
    
    // Support common hash algorithms
    const algorithm = hashType.toLowerCase().replace('-', '');
    try {
      hashValue = crypto.createHash(algorithm).update(inputData).digest('hex');
    } catch (e) {
      // Fallback to sha256 if unsupported
      hashValue = crypto.createHash('sha256').update(inputData).digest('hex');
      hashType = 'SHA-256';
    }

    const simulation = await prisma.hashSimulation.create({
      data: {
        studentId,
        inputData,
        hashType,
        hashValue,
      },
    });

    return simulation;
  }

  static async getSimulations(studentId: string) {
    return prisma.hashSimulation.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50, // limit to 50 recent simulations
    });
  }
}
