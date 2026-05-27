import prisma from '../src/db/index';

async function main() {
  console.log('Seeding database...');

  // Create Courses
  const course1 = await prisma.course.upsert({
    where: { id: 'course-1' },
    update: {},
    create: {
      id: 'course-1',
      title: 'Soroban 101: Smart Contract Basics',
      description: 'Learn the fundamentals of Soroban smart contracts on the Stellar network.',
      instructor: 'Stellar Dev Hub',
      credits: 3,
    },
  });

  const course2 = await prisma.course.upsert({
    where: { id: 'course-2' },
    update: {},
    create: {
      id: 'course-2',
      title: 'Stellar Blockchain Fundamentals',
      description:
        'Understand how the Stellar blockchain works, including assets, accounts, and trustlines.',
      instructor: 'Web3 Academy',
      credits: 2,
    },
  });

  const course3 = await prisma.course.upsert({
    where: { id: 'course-3' },
    update: {},
    create: {
      id: 'course-3',
      title: 'DApp Development with Next.js',
      description: 'Build full-stack decentralized applications using Next.js and Soroban.',
      instructor: 'Frontend Masters',
      credits: 4,
    },
  });

  console.log({ course1, course2, course3 });

  // Create a Student
  const student = await prisma.student.upsert({
    where: { email: 'student@example.com' },
    update: {},
    create: {
      email: 'student@example.com',
      password: 'password123', // In a real app, hash this!
      firstName: 'John',
      lastName: 'Doe',
    },
  });

  console.log({ student });

  // Create an Enrollment
  const enrollment = await prisma.enrollment.upsert({
    where: { id: 'enrollment-1' },
    update: {},
    create: {
      id: 'enrollment-1',
      studentId: student.id,
      courseId: course1.id,
      status: 'ENROLLED',
    },
  });

  console.log({ enrollment });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
