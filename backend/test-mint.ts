import 'dotenv/config';
import { certificateService } from './src/certificates/CertificateService.js';
import prisma from './src/db/index.js';

async function test() {
  try {
    const student = await prisma.student.findFirst();
    const course = await prisma.course.findFirst();

    if (!student || !course) {
      console.log('No student or course found');
      return;
    }

    // Ensure enrollment
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
      update: {},
      create: { studentId: student.id, courseId: course.id, status: 'active' }
    });

    console.log(`Minting for student ${student.id} and course ${course.id}`);

    const result = await certificateService.mintCertificate(
      { studentId: student.id, courseId: course.id },
      'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
      'CAA6BTXNUO7Q775CKBBFVQYG27HU3FTFTJ6MUQ64TWFXYNATHTUQDRBH',
      'stellar-testnet'
    );
    console.log('Success:', result.id);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
