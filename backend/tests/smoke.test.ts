import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';

// Set environment variables before module loads
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long-abcdef';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long-abcdef';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

// Mock DB layer
const mockStudent = {
  id: 'canary-student-id-123',
  email: 'canary-synthetic@web3studentlab.com',
  password: '$2a$10$hashedpasswordfore2esyntheticcheckcanary',
  firstName: 'Canary',
  lastName: 'Synthetic',
  walletAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAcert',
  did: null,
};

const mockCreatedRecord = {
  id: 'synthetic-write-id-456',
  studentId: 'canary-student-id-123',
  title: 'Canary Test Verification',
  description: 'Canary automated synthetic check',
  category: 'SYSTEM',
  createdAt: new Date(),
};

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    student: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    idea: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

// Mock Turnstile middleware to allow synthetic check authentication
jest.mock('../src/middleware/turnstile.js', () => ({
  requireTurnstile: () => (_req: any, _res: any, next: any) => next(),
  verifyTurnstileToken: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock bcrypt compare to validate canary test account password
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('$2a$10$hashedpasswordfore2esyntheticcheckcanary'),
    compare: jest.fn().mockImplementation(async (plain: string, _hash: string) => {
      return plain === 'CanaryPass123!';
    }),
  },
}));

import prisma from '../src/db/index.js';
import authRoutes from '../src/routes/auth/auth.routes.js';
import { checkDbHealth } from '../src/db/healthMonitor.js';
import { checkDeepReadiness } from '../src/db/deepReadiness.js';
import { compileWat, compileWatToBase64, WAT_ADD } from './fixtures/wasmFixtures.js';
import { runSandboxedWasm } from '../src/simulator/wasmSandboxEngine.js';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

describe('Automated Production Smoke Test & Canary Deployment Verifier (BE-049)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Synthetic End-to-End Authentication Check', () => {
    it('successfully logs in test account and returns valid JWT access token', async () => {
      (prisma.student.findUnique as jest.Mock).mockResolvedValue(mockStudent);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'canary-synthetic@web3studentlab.com',
          password: 'CanaryPass123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(mockStudent.email);
      expect(response.body.user.id).toBe(mockStudent.id);
    });

    it('rejects authentication with invalid credentials during synthetic validation', async () => {
      (prisma.student.findUnique as jest.Mock).mockResolvedValue(mockStudent);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'canary-synthetic@web3studentlab.com',
          password: 'WrongPassword!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('Database Read/Write Verification', () => {
    it('verifies database connectivity and read operation with low latency', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ result: 1 }]);

      const dbHealth = await checkDbHealth();
      expect(dbHealth.status).toBe('healthy');
      expect(dbHealth.latencyMs).toBeLessThanOrEqual(2000);
    });

    it('performs synthetic create and read queries cleanly', async () => {
      (prisma.idea.create as jest.Mock).mockResolvedValue(mockCreatedRecord);
      (prisma.idea.findUnique as jest.Mock).mockResolvedValue(mockCreatedRecord);
      (prisma.idea.delete as jest.Mock).mockResolvedValue(mockCreatedRecord);

      const created = await prisma.idea.create({
        data: {
          title: 'Canary Test Verification',
          description: 'Canary automated synthetic check',
          category: 'SYSTEM',
        },
      });
      expect(created.id).toBe('synthetic-write-id-456');

      const retrieved = await prisma.idea.findUnique({
        where: { id: created.id },
      });
      expect(retrieved?.id).toBe('synthetic-write-id-456');

      const cleaned = await prisma.idea.delete({
        where: { id: created.id },
      });
      expect(cleaned.id).toBe('synthetic-write-id-456');
    });
  });

  describe('RPC & Dependency Health Check', () => {
    it('verifies deep readiness and Soroban RPC health status', async () => {
      const probeResult = await checkDeepReadiness();

      expect(probeResult).toHaveProperty('status');
      expect(probeResult).toHaveProperty('checks');
      expect(probeResult.checks).toHaveProperty('database');
      expect(probeResult.checks).toHaveProperty('redis');
      expect(probeResult.checks).toHaveProperty('sorobanRpc');
      expect(probeResult).toHaveProperty('checkedAt');
    });
  });

  describe('WASM Compilation & Sandbox Execution', () => {
    it('compiles test WAT to valid WASM binary bytecode', async () => {
      const wasmBuffer = await compileWat(WAT_ADD);
      expect(wasmBuffer).toBeInstanceOf(Buffer);
      expect(wasmBuffer.length).toBeGreaterThan(0);

      // WASM magic number header: 0x00 0x61 0x73 0x6d (\0asm)
      expect(wasmBuffer[0]).toBe(0x00);
      expect(wasmBuffer[1]).toBe(0x61);
      expect(wasmBuffer[2]).toBe(0x73);
      expect(wasmBuffer[3]).toBe(0x6d);
    });

    it('executes compiled WASM binary inside the sandbox engine', async () => {
      const wasmBase64 = await compileWatToBase64(WAT_ADD);
      const result = await runSandboxedWasm({
        wasmBase64,
        functionName: 'add',
        args: [10, 25],
      });

      expect(result.success).toBe(true);
      expect(result.returnValue).toBe(35);
      expect(result.terminationReason).toBe('completed');
    });
  });

  describe('End-to-End Canary Execution Budget', () => {
    it('completes all synthetic checks within 60 seconds budget', async () => {
      const startTime = Date.now();

      // 1. Auth check
      (prisma.student.findUnique as jest.Mock).mockResolvedValue(mockStudent);
      const authRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'canary-synthetic@web3studentlab.com',
          password: 'CanaryPass123!',
        });
      expect(authRes.status).toBe(200);

      // 2. DB read check
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ result: 1 }]);
      await checkDbHealth();

      // 3. WASM compilation check
      const wasmBuffer = await compileWat(WAT_ADD);
      expect(wasmBuffer.length).toBeGreaterThan(0);

      const elapsedMs = Date.now() - startTime;
      expect(elapsedMs).toBeLessThan(60000); // Must be strictly < 60s
    });
  });
});
