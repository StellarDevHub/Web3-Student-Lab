import request from 'supertest';
import prisma from '../src/db/index.js';
import {
  DidValidationError,
  parseSupportedDid,
  validateStudentDidCompatibility,
} from '../src/auth/auth.service.js';
import { app } from '../src/index.js';

const VALID_WALLET_A = 'GBST4SW5DKCK3SN5EQQYQA4SDSF4NYVZ647YV6NA5PHWJ2N2UJNAPNAI';
const VALID_WALLET_B = 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO';

describe('DID validation', () => {
  describe('parseSupportedDid', () => {
    it('normalizes supported soroban DIDs', () => {
      expect(parseSupportedDid('  did:soroban:TESTNET:student-123#profile  ')).toEqual(
        expect.objectContaining({
          method: 'soroban',
          network: 'testnet',
          subject: 'student-123',
          fragment: 'profile',
          normalizedDid: 'did:soroban:testnet:student-123#profile',
        })
      );
    });

    it('rejects unsupported soroban networks', () => {
      expect(() => parseSupportedDid('did:soroban:devnet:student-123')).toThrow(
        new DidValidationError('Unsupported DID network. Supported Soroban networks: testnet, mainnet, futurenet')
      );
    });
  });

  describe('validateStudentDidCompatibility', () => {
    it('rejects a soroban DID whose network does not match the active network', () => {
      expect(() =>
        validateStudentDidCompatibility({
          did: 'did:soroban:mainnet:student-123',
          expectedNetwork: 'testnet',
        })
      ).toThrow(new DidValidationError('DID network mismatch. Expected testnet but received mainnet'));
    });

    it('rejects a stellar-subject mismatch when the wallet is linked', () => {
      expect(() =>
        validateStudentDidCompatibility({
          did: `did:stellar:${VALID_WALLET_A}`,
          walletAddress: VALID_WALLET_B,
        })
      ).toThrow(new DidValidationError('DID subject mismatch. Stellar DID subject must match the linked wallet address'));
    });
  });

  describe('route enforcement', () => {
    beforeEach(async () => {
      await prisma.certificate.deleteMany();
      await prisma.enrollment.deleteMany();
      await prisma.course.deleteMany();
      await prisma.student.deleteMany();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('stores a normalized DID on authenticated profile updates', async () => {
      const registerResponse = await request(app).post('/api/v1/auth/register').send({
        email: 'normalized-did@example.com',
        password: 'password123',
        firstName: 'Normalized',
        lastName: 'Did',
      });

      const token = registerResponse.body.token as string;

      const updateResponse = await request(app)
        .put('/api/v1/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ did: '  did:soroban:TESTNET:student-123#profile  ' })
        .expect(200);

      expect(updateResponse.body.did).toBe('did:soroban:testnet:student-123#profile');
    });

    it('stores a normalized stellar DID on authenticated profile updates', async () => {
      const registerResponse = await request(app).post('/api/v1/auth/register').send({
        email: 'stellar-did@example.com',
        password: 'password123',
        firstName: 'Stellar',
        lastName: 'Did',
        walletAddress: VALID_WALLET_A,
      });

      const token = registerResponse.body.token as string;

      const updateResponse = await request(app)
        .put('/api/v1/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ did: ` did:stellar:${VALID_WALLET_A.toLowerCase()} ` })
        .expect(200);

      expect(updateResponse.body.did).toBe(`did:stellar:${VALID_WALLET_A}`);
    });

    it('rejects unsupported DID networks on authenticated profile updates', async () => {
      const registerResponse = await request(app).post('/api/v1/auth/register').send({
        email: 'unsupported-network@example.com',
        password: 'password123',
        firstName: 'Unsupported',
        lastName: 'Network',
      });

      const token = registerResponse.body.token as string;

      const response = await request(app)
        .put('/api/v1/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ did: 'did:soroban:devnet:student-123' })
        .expect(400);

      expect(response.body.error).toContain('Unsupported DID network');
    });

    it('rejects enrollment when the linked DID does not match the student wallet', async () => {
      const student = await prisma.student.create({
        data: {
          email: 'mismatch-enrollment@example.com',
          password: 'password123',
          firstName: 'Mismatch',
          lastName: 'Enrollment',
          walletAddress: VALID_WALLET_B,
          did: `did:stellar:${VALID_WALLET_A}`,
        },
      });

      const course = await prisma.course.create({
        data: {
          title: 'Identity Systems 101',
          description: 'Validation test course',
          instructor: 'Test Instructor',
          credits: 3,
        },
      });

      const response = await request(app)
        .post('/api/v1/enrollments')
        .send({
          studentId: student.id,
          courseId: course.id,
        })
        .expect(400);

      expect(response.body.error).toContain('DID subject mismatch');
    });
  });
});
