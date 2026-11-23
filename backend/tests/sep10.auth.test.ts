import express from 'express';
import request from 'supertest';
import { Keypair, Networks, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';

const testServerSecret = 'SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X';
process.env.STELLAR_SERVER_SECRET = testServerSecret;
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long-abcdef';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long-abcdef';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    student: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'student-wallet-123',
        ...data,
      })),
      update: jest.fn(),
      delete: jest.fn(),
    },
    authNonce: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

jest.mock('../src/middleware/turnstile.js', () => ({
  requireTurnstile: () => (_req: any, _res: any, next: any) => next(),
}));

import authRoutes from '../src/routes/auth/auth.routes.js';
import {
  buildSep10Challenge,
  getHomeDomain,
  getNetworkPassphrase,
  getServerKeypair,
  getWebAuthDomain,
  verifySep10Challenge,
} from '../src/auth/sep10.service.js';
import { comparePassword, login } from '../src/auth/auth.service.js';
import { verifyAccessToken, verifyRefreshToken } from '../src/auth/token.service.js';
import prisma from '../src/db/index.js';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

/**
 * Deterministic in-memory Horizon stub. Tests inject it into
 * verifySep10Challenge so no outbound network request is ever made.
 */
function makeHorizonStub(
  accounts: Record<string, { signers: { key: string; weight: number }[]; thresholds: { low_threshold: number; med_threshold: number; high_threshold: number } } | null>,
  failure?: any,
): any {
  return {
    loadAccount: jest.fn(async (publicKey: string) => {
      if (failure) throw failure;
      const acct = accounts[publicKey];
      if (acct === undefined || acct === null) {
        const err: any = new Error('Not Found');
        err.response = { status: 404 };
        throw err;
      }
      return acct;
    }),
  };
}

describe('SEP-0010 Stellar Web Authentication Gateway Tests', () => {
  const serverKeypair = getServerKeypair();
  const networkPassphrase = getNetworkPassphrase();
  const homeDomain = getHomeDomain();
  const webAuthDomain = getWebAuthDomain();

  let clientKeypair: Keypair;
  let clientPublicKey: string;

  beforeEach(() => {
    process.env.STELLAR_SERVER_SECRET = testServerSecret;
    clientKeypair = Keypair.random();
    clientPublicKey = clientKeypair.publicKey();
  });

  describe('Server Key Configuration & Hardening', () => {
    it('should throw an explicit error if STELLAR_SERVER_SECRET is missing or invalid', () => {
      delete process.env.STELLAR_SERVER_SECRET;
      delete process.env.STELLAR_ISSUER_SECRET_KEY;
      delete process.env.STELLAR_ISSUER_SECRET;

      expect(() => getServerKeypair()).toThrow(
        'Server Stellar secret key is not configured or invalid'
      );

      // Restore for subsequent tests
      process.env.STELLAR_SERVER_SECRET = testServerSecret;
    });
  });

  describe('Challenge Transaction Generation', () => {
    it('should generate an RFC-compliant SEP-0010 challenge transaction envelope', async () => {
      const challenge = await buildSep10Challenge(clientPublicKey);

      expect(challenge).toBeDefined();
      expect(challenge.transaction).toBeDefined();
      expect(challenge.networkPassphrase).toBe(networkPassphrase);

      const tx = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);

      // 1. Sequence number must be 0
      expect(tx.sequence).toBe('0');

      // 2. Source account must be server keypair
      expect(tx.source).toBe(serverKeypair.publicKey());

      // 3. Timebounds must be exactly 300 seconds
      expect(tx.timeBounds).toBeDefined();
      const minTime = parseInt(tx.timeBounds!.minTime, 10);
      const maxTime = parseInt(tx.timeBounds!.maxTime, 10);
      expect(maxTime - minTime).toBe(300);

      // 4. Operation 1 must be ManageData with clientPublicKey as source and `${homeDomain} auth` as name
      expect(tx.operations.length).toBeGreaterThanOrEqual(1);
      const op1 = tx.operations[0] as any;
      expect(op1.type).toBe('manageData');
      expect(op1.source).toBe(clientPublicKey);
      expect(op1.name).toBe(`${homeDomain} auth`);
      expect(op1.value.length).toBe(64);

      // 5. Operation 2 must be web_auth_domain
      if (tx.operations.length > 1) {
        const op2 = tx.operations[1] as any;
        expect(op2.type).toBe('manageData');
        expect(op2.source).toBe(serverKeypair.publicKey());
        expect(op2.name).toBe('web_auth_domain');
      }

      // 6. Server signature must be present and valid
      expect(tx.signatures.length).toBe(1);
    });

    it('should reject invalid client public key formats with 400', async () => {
      await expect(buildSep10Challenge('invalid-stellar-key')).rejects.toThrow(
        'Invalid Stellar public key format'
      );
    });
  });

  describe('Single-Signature Verification (Master Key)', () => {
    it('should verify a valid client signature and issue hardened JWT tokens', async () => {
      const challenge = await buildSep10Challenge(clientPublicKey);

      // Client signs the challenge transaction
      const tx = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);
      tx.sign(clientKeypair);
      const signedXdr = tx.toXDR();

      const horizon = makeHorizonStub({
        [clientPublicKey]: {
          signers: [{ key: clientPublicKey, weight: 1 }],
          thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        },
      });

      const authResponse = await verifySep10Challenge(
        signedXdr,
        clientPublicKey,
        undefined,
        undefined,
        horizon,
      );

      expect(authResponse).toBeDefined();
      expect(authResponse.user).toBeDefined();
      expect(authResponse.accessToken).toBeDefined();
      expect(authResponse.refreshToken).toBeDefined();
      expect(authResponse.signers).toContain(clientPublicKey);

      // Verify issued JWT tokens
      const accessPayload = verifyAccessToken(authResponse.accessToken);
      expect(accessPayload.userId).toBe(authResponse.user.id);

      const refreshPayload = await verifyRefreshToken(authResponse.refreshToken);
      expect(refreshPayload.userId).toBe(authResponse.user.id);
      expect(refreshPayload.familyId).toBeDefined();
    });

    it('should fall back to non-existent account handling when Horizon returns 404', async () => {
      const challenge = await buildSep10Challenge(clientPublicKey);
      const tx = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);
      tx.sign(clientKeypair);

      // Account not funded on the ledger: no signers entry is available,
      // so verification must still accept the client master key implicitly.
      const horizon = makeHorizonStub({});

      const authResponse = await verifySep10Challenge(
        tx.toXDR(),
        clientPublicKey,
        undefined,
        undefined,
        horizon,
      );
      expect(authResponse.signers).toContain(clientPublicKey);
    });
  });

  describe('Multi-Signature Threshold Verification & Horizon Fail-Closed', () => {
    it('should verify accounts with multi-signature threshold requirements', async () => {
      const signer1 = Keypair.random();
      const signer2 = Keypair.random();
      const signer3 = Keypair.random();

      const mockSigners = [
        { key: signer1.publicKey(), weight: 10 },
        { key: signer2.publicKey(), weight: 15 },
        { key: signer3.publicKey(), weight: 20 },
      ];
      const medThreshold = 25;

      const mockHorizonServer = makeHorizonStub({
        [clientPublicKey]: {
          signers: mockSigners,
          thresholds: {
            low_threshold: 10,
            med_threshold: medThreshold,
            high_threshold: 30,
          },
        },
      });

      const challenge = await buildSep10Challenge(clientPublicKey);

      // Case A: Insufficient weight (signer 1 only, weight 10 < 25) -> Must fail
      const txA = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);
      txA.sign(signer1);
      await expect(
        verifySep10Challenge(
          txA.toXDR(),
          clientPublicKey,
          undefined,
          undefined,
          mockHorizonServer
        )
      ).rejects.toThrow();

      // Case B: Sufficient weight (signer 1 + signer 2, weight 10 + 15 = 25 >= 25) -> Must succeed
      const challengeB = await buildSep10Challenge(clientPublicKey);
      const txB = TransactionBuilder.fromXDR(challengeB.transaction, networkPassphrase);
      txB.sign(signer1);
      txB.sign(signer2);
      const resB = await verifySep10Challenge(
        txB.toXDR(),
        clientPublicKey,
        undefined,
        undefined,
        mockHorizonServer
      );
      expect(resB.accessToken).toBeDefined();
      expect(resB.signers).toHaveLength(2);
      expect(resB.signers).toContain(signer1.publicKey());
      expect(resB.signers).toContain(signer2.publicKey());

      // Case C: Excess weight (signer 2 + signer 3, weight 15 + 20 = 35 >= 25) -> Must succeed
      const challengeC = await buildSep10Challenge(clientPublicKey);
      const txC = TransactionBuilder.fromXDR(challengeC.transaction, networkPassphrase);
      txC.sign(signer2);
      txC.sign(signer3);
      const resC = await verifySep10Challenge(
        txC.toXDR(),
        clientPublicKey,
        undefined,
        undefined,
        mockHorizonServer
      );
      expect(resC.accessToken).toBeDefined();
      expect(resC.signers).toContain(signer2.publicKey());
      expect(resC.signers).toContain(signer3.publicKey());
    });

    it('should strictly fail closed on Horizon network/server errors (5xx/timeout) and refuse single-key fallback', async () => {
      const mockHorizonServer = makeHorizonStub(
        {},
        {
          response: { status: 500, data: 'Horizon internal server error' },
          message: 'Horizon 500 Error',
        },
      );

      const challenge = await buildSep10Challenge(clientPublicKey);
      const tx = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);
      tx.sign(clientKeypair);
      const signedXdr = tx.toXDR();

      // Must strictly throw fail-closed error rather than falling back to threshold 1
      await expect(
        verifySep10Challenge(
          signedXdr,
          clientPublicKey,
          undefined,
          undefined,
          mockHorizonServer
        )
      ).rejects.toThrow('Horizon network error: Unable to verify account signers from network');
    });
  });

  describe('Security: Timebounds, Replay & Tamper Defense', () => {
    it('should reject expired challenge transactions', async () => {
      const challenge = await buildSep10Challenge(clientPublicKey);
      const tx = TransactionBuilder.fromXDR(challenge.transaction, networkPassphrase);
      tx.sign(clientKeypair);
      const signedXdr = tx.toXDR();

      // Mock Date.now to simulate 10 minutes into the future (past 300s window)
      const futureTime = Date.now() + 600 * 1000;
      jest.spyOn(Date, 'now').mockReturnValue(futureTime);

      await expect(
        verifySep10Challenge(
          signedXdr,
          clientPublicKey,
          undefined,
          undefined,
          makeHorizonStub({}),
        )
      ).rejects.toThrow('Challenge transaction has expired');

      jest.restoreAllMocks();
    });
  });
});
