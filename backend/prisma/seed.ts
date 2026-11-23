import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
// @ts-ignore
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || '';
const useSSL =
  process.env.NODE_ENV !== 'test' &&
  !connectionString.includes('sslmode=disable') &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1');

const normalizedConnectionString = useSSL
  ? connectionString.replace(/sslmode=[^&]+/, 'sslmode=no-verify')
  : connectionString;

const pool = new Pool({
  connectionString: normalizedConnectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed script...');

  // 1. Seed 5 Multi-Stage Courses
  const coursesData = [
    {
      id: 'course-1',
      title: 'Soroban 101: Smart Contract Basics',
      description: 'Learn the fundamentals of Soroban smart contracts on the Stellar network.',
      instructor: 'Stellar Dev Hub',
      credits: 3,
    },
    {
      id: 'course-2',
      title: 'Stellar Blockchain Fundamentals',
      description: 'Understand how the Stellar blockchain works, including assets, accounts, and trustlines.',
      instructor: 'Web3 Academy',
      credits: 2,
    },
    {
      id: 'course-3',
      title: 'DApp Development with Next.js',
      description: 'Build full-stack decentralized applications using Next.js and Soroban.',
      instructor: 'Frontend Masters',
      credits: 4,
    },
    {
      id: 'course-4',
      title: 'Advanced Soroban & Rust Smart Contracts',
      description: 'Deep dive into WASM memory, Rust architecture, and smart contract security auditing.',
      instructor: 'Rust Security Labs',
      credits: 5,
    },
    {
      id: 'course-5',
      title: 'DeFi & Automated Market Makers on Stellar',
      description: 'Build DEX liquidity pools, TWAP oracles, and atomic arbitrage bots on Stellar.',
      instructor: 'DeFi Engineering Group',
      credits: 5,
    },
  ];

  const courses = [];
  for (const c of coursesData) {
    const course = await prisma.course.upsert({
      where: { id: c.id },
      update: {
        title: c.title,
        description: c.description,
        instructor: c.instructor,
        credits: c.credits,
      },
      create: c,
    });
    courses.push(course);
  }
  console.log(`✓ Seeded ${courses.length} courses.`);

  // 2. Seed Realistic Student Test Profiles
  const studentsData = [
    {
      id: 'student-1',
      email: 'student@example.com',
      password: '$2a$10$e8wVqF6K6gqJ1cK8vM1uU.sD7b0YVqN1j2k3l4m5n6o7p8q9r0s1t', // hashed password
      firstName: 'John',
      lastName: 'Doe',
      walletAddress: 'GAB1234567890ACCOUNTTESTSTELLAR1234567890ABCDEF',
      githubUsername: 'johndoe-web3',
    },
    {
      id: 'student-2',
      email: 'alice@stellar.org',
      password: '$2a$10$e8wVqF6K6gqJ1cK8vM1uU.sD7b0YVqN1j2k3l4m5n6o7p8q9r0s1t',
      firstName: 'Alice',
      lastName: 'Smith',
      walletAddress: 'GALICE987654321STELLARACCOUNT9876543210ABCDEF',
      githubUsername: 'alice-crypto',
    },
    {
      id: 'student-3',
      email: 'bob@soroban.dev',
      password: '$2a$10$e8wVqF6K6gqJ1cK8vM1uU.sD7b0YVqN1j2k3l4m5n6o7p8q9r0s1t',
      firstName: 'Bob',
      lastName: 'Johnson',
      walletAddress: 'GBOB555444333STELLARACCOUNT5554443330ABCDEF',
      githubUsername: 'bob-rust-dev',
    },
    {
      id: 'student-4',
      email: 'charlie@rust.io',
      password: '$2a$10$e8wVqF6K6gqJ1cK8vM1uU.sD7b0YVqN1j2k3l4m5n6o7p8q9r0s1t',
      firstName: 'Charlie',
      lastName: 'Brown',
      walletAddress: 'GCHARLIE111222333STELLARACCOUNT111222333ABCDEF',
      githubUsername: 'charlie-wasm',
    },
    {
      id: 'student-5',
      email: 'diana@web3.lab',
      password: '$2a$10$e8wVqF6K6gqJ1cK8vM1uU.sD7b0YVqN1j2k3l4m5n6o7p8q9r0s1t',
      firstName: 'Diana',
      lastName: 'Prince',
      walletAddress: 'GDIANA999888777STELLARACCOUNT999888777ABCDEF',
      githubUsername: 'diana-defi',
    },
  ];

  const students = [];
  for (const s of studentsData) {
    const student = await prisma.student.upsert({
      where: { email: s.email },
      update: {
        firstName: s.firstName,
        lastName: s.lastName,
        walletAddress: s.walletAddress,
        githubUsername: s.githubUsername,
      },
      create: s,
    });
    students.push(student);
  }
  console.log(`✓ Seeded ${students.length} student profiles.`);

  // 3. Seed Enrollments
  const enrollmentsData = [
    { id: 'enrollment-1', studentId: students[0].id, courseId: 'course-1', status: 'ENROLLED' },
    { id: 'enrollment-2', studentId: students[0].id, courseId: 'course-2', status: 'COMPLETED' },
    { id: 'enrollment-3', studentId: students[1].id, courseId: 'course-1', status: 'COMPLETED' },
    { id: 'enrollment-4', studentId: students[1].id, courseId: 'course-3', status: 'ENROLLED' },
    { id: 'enrollment-5', studentId: students[2].id, courseId: 'course-4', status: 'ENROLLED' },
    { id: 'enrollment-6', studentId: students[3].id, courseId: 'course-4', status: 'COMPLETED' },
    { id: 'enrollment-7', studentId: students[4].id, courseId: 'course-5', status: 'ENROLLED' },
  ];

  for (const e of enrollmentsData) {
    await prisma.enrollment.upsert({
      where: { id: e.id },
      update: { status: e.status },
      create: e,
    });
  }
  console.log(`✓ Seeded ${enrollmentsData.length} course enrollments.`);

  // 4. Seed Learning Progress Records
  const progressData = [
    {
      id: 'progress-1',
      studentId: students[0].id,
      courseId: 'course-1',
      completedLessons: JSON.stringify(['course-1-lesson-1', 'course-1-lesson-2']),
      currentModuleId: 'course-1-module-2',
      percentage: 50,
      status: 'in_progress',
    },
    {
      id: 'progress-2',
      studentId: students[0].id,
      courseId: 'course-2',
      completedLessons: JSON.stringify([
        'course-2-lesson-1',
        'course-2-lesson-2',
        'course-2-lesson-3',
        'course-2-lesson-4',
      ]),
      currentModuleId: 'course-2-module-2',
      percentage: 100,
      status: 'completed',
    },
    {
      id: 'progress-3',
      studentId: students[1].id,
      courseId: 'course-1',
      completedLessons: JSON.stringify([
        'course-1-lesson-1',
        'course-1-lesson-2',
        'course-1-lesson-3',
        'course-1-lesson-4',
      ]),
      currentModuleId: 'course-1-module-2',
      percentage: 100,
      status: 'completed',
    },
  ];

  for (const p of progressData) {
    await prisma.learningProgress.upsert({
      where: {
        studentId_courseId: {
          studentId: p.studentId,
          courseId: p.courseId,
        },
      },
      update: {
        completedLessons: p.completedLessons,
        currentModuleId: p.currentModuleId,
        percentage: p.percentage,
        status: p.status,
      },
      create: p,
    });
  }
  console.log(`✓ Seeded ${progressData.length} learning progress records.`);

  // 5. Seed Issued On-Chain Certificates
  const certsData = [
    {
      id: 'cert-1',
      tokenId: 'CERT-STELLAR-101-001',
      studentId: students[0].id,
      courseId: 'course-2',
      status: 'MINTED',
      grade: 'A+',
      certificateHash: '0xabc123def4567890123456789012345678901234567890123456789012345678',
      transactionHash: '0x777888999aaaabbbcccdddeeefff000111222333444555666777888999aaabbb',
      metadataUri: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/cert-1.json',
      contractAddress: 'CCONTRACTADDRESS1234567890STELLARBENEFICIARY123',
      network: 'futurenet',
    },
    {
      id: 'cert-2',
      tokenId: 'CERT-SOROBAN-101-002',
      studentId: students[1].id,
      courseId: 'course-1',
      status: 'MINTED',
      grade: 'A',
      certificateHash: '0xdef456789012345678901234567890123456789012345678901234567890abc1',
      transactionHash: '0x111222333444555666777888999aaaabbbcccdddeeefff000777888999aaabbb',
      metadataUri: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/cert-2.json',
      contractAddress: 'CCONTRACTADDRESS1234567890STELLARBENEFICIARY123',
      network: 'futurenet',
    },
  ];

  for (const cert of certsData) {
    await prisma.certificate.upsert({
      where: { tokenId: cert.tokenId },
      update: {
        status: cert.status,
        grade: cert.grade,
      },
      create: cert,
    });
  }
  console.log(`✓ Seeded ${certsData.length} issued certificates.`);

  // 6. Seed Course Feedback Reviews
  const feedbackData = [
    {
      id: 'feedback-1',
      studentId: students[0].id,
      courseId: 'course-2',
      rating: 5,
      review: 'Exceptional introduction to Stellar architecture and trustline management!',
    },
    {
      id: 'feedback-2',
      studentId: students[1].id,
      courseId: 'course-1',
      rating: 5,
      review: 'The Soroban contract examples were clear and very easy to follow.',
    },
  ];

  for (const fb of feedbackData) {
    await prisma.feedback.upsert({
      where: {
        studentId_courseId: {
          studentId: fb.studentId,
          courseId: fb.courseId,
        },
      },
      update: {
        rating: fb.rating,
        review: fb.review,
      },
      create: fb,
    });
  }
  console.log(`✓ Seeded ${feedbackData.length} feedback reviews.`);

  // 7. Seed P2P Nodes & Demo Webhooks
  await prisma.p2PNode.upsert({
    where: { nodeId: 'node-stellar-testnet-1' },
    update: { status: 'online' },
    create: {
      id: 'p2p-node-1',
      nodeId: 'node-stellar-testnet-1',
      nodeName: 'Stellar Futurenet Validator Node Alpha',
      status: 'online',
      ipAddress: '127.0.0.1',
      port: 11625,
    },
  });

  await prisma.webhookSubscription.upsert({
    where: {
      workspaceId_url: {
        workspaceId: 'default',
        url: 'https://webhook.site/demo-event-receiver',
      },
    },
    update: { active: true },
    create: {
      id: 'webhook-sub-1',
      workspaceId: 'default',
      url: 'https://webhook.site/demo-event-receiver',
      secret: 'whsec_demo_secret_key_12345',
      events: JSON.stringify(['lesson.completed', 'certificate.minted']),
      active: true,
    },
  });

  console.log('🎉 Seeding complete! Database is fully populated.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
