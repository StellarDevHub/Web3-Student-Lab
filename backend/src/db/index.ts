import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/web3-student-lab?schema=public';

const pool = new pg.Pool({ connectionString });
export const adapter = new PrismaPg(pool);

// For convenience, store adapter globally (optional)
const globalForPrisma = globalThis as unknown as {
  prismaAdapter?: PrismaPg;
};

if (!globalForPrisma.prismaAdapter) {
  globalForPrisma.prismaAdapter = adapter;
}

export default globalForPrisma.prismaAdapter;
