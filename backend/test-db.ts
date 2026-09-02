import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || "postgresql://owner_avatar_web3_student_lab_user:h3RuzNc9UpiPre2h0X4sqNoPyRkKwFMQ@dpg-d8gvln5ckfvc73dc66kg-a.oregon-postgres.render.com/owner_avatar_web3_student_lab?sslmode=require";

async function main() {
  try {
    const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    const student = await prisma.student.findUnique({
      where: { walletAddress: "0x1234567890123456789012345678901234567890" }
    });
    console.log("Success:", student);
    await pool.end();
  } catch (e) {
    console.error("ERROR:", e);
  }
}
main();
