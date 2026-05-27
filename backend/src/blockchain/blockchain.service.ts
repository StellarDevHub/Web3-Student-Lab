import prisma from '../db/index.js';

export interface BlockchainRecord {
  id: string;
  txHash: string;
  timestamp: Date;
  status: 'verified' | 'pending';
}

/**
 * Service to interact with Stellar/Soroban or simulate blockchain records.
 */
export const getStudentAchievements = async (studentId: string): Promise<BlockchainRecord[]> => {
  // Simulating fetching verified achievements from on-chain transactions meta
  const certificates = await prisma.certificate.findMany({
    where: {
      studentId,
      status: 'issued',
    },
  });

  return certificates.map(
    (cert: (typeof certificates)[number]): BlockchainRecord => ({
      id: cert.id,
      txHash: cert.certificateHash || `0x${Math.random().toString(16).substring(2, 40)}`,
      timestamp: cert.issuedAt,
      status: cert.certificateHash ? 'verified' : 'pending',
    })
  );
};
