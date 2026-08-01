import { describe, expect, it, afterEach } from '@jest/globals';
import {
  CertificateBlockchainService,
  BlockchainNotConfiguredError,
} from '../src/blockchain/CertificateBlockchainService.js';

const ENV_KEYS = ['BLOCKCHAIN_SIMULATION_MODE', 'CERTIFICATE_CONTRACT_ID'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

describe('CertificateBlockchainService', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('simulation mode (explicit)', () => {
    it('defaults to simulation mode when no contract ID is configured', () => {
      delete process.env.CERTIFICATE_CONTRACT_ID;
      delete process.env.BLOCKCHAIN_SIMULATION_MODE;

      const service = new CertificateBlockchainService();

      expect(service.getMode()).toBe('simulation');
      expect(service.isConnected()).toBe(false);
    });

    it('mints a simulated certificate with a success result and mock transaction hash', async () => {
      delete process.env.CERTIFICATE_CONTRACT_ID;

      const service = new CertificateBlockchainService();
      const result = await service.mintCertificate({ verification: { tokenId: 'tok-1' } });

      expect(result.success).toBe(true);
      expect(result.tokenId).toBe('tok-1');
      expect(result.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('verifies, reads owner, and reads certificate data in simulation mode', async () => {
      delete process.env.CERTIFICATE_CONTRACT_ID;
      const service = new CertificateBlockchainService();

      await expect(service.verifyOnChain('tok-1')).resolves.toBe(true);
      await expect(service.getOwner('tok-1')).resolves.toMatch(/^G[A-Z0-9]{55}$/);

      const data = await service.getCertificateData('tok-1');
      expect(data).toMatchObject({ tokenId: 'tok-1', network: expect.any(String) });
    });

    it('returns an empty transaction history array in simulation mode', async () => {
      delete process.env.CERTIFICATE_CONTRACT_ID;
      const service = new CertificateBlockchainService();

      await expect(service.getTransactionHistory('tok-1')).resolves.toEqual([]);
    });

    it('does not throw when revoking in simulation mode', async () => {
      delete process.env.CERTIFICATE_CONTRACT_ID;
      const service = new CertificateBlockchainService();

      await expect(service.revokeCertificate('tok-1', 'test reason')).resolves.toBeUndefined();
    });
  });

  describe('live mode requested but no contract integration exists (explicit failure, not silent success)', () => {
    it('falls back to simulation mode and logs why, rather than silently pretending to be live', () => {
      process.env.CERTIFICATE_CONTRACT_ID = 'CCERTIFICATECONTRACTID';
      process.env.BLOCKCHAIN_SIMULATION_MODE = 'false';

      const service = new CertificateBlockchainService();

      // initializeClient() falls back to simulation mode since there's no
      // real Soroban certificate contract integration to call yet — this
      // is the documented, honest behavior (see class docs), not a bug.
      expect(service.getMode()).toBe('simulation');
    });

    it('getTransactionHistory throws BlockchainNotConfiguredError in true live mode (bypasses the circuit breaker, so this is deterministic)', async () => {
      process.env.CERTIFICATE_CONTRACT_ID = 'CCERTIFICATECONTRACTID';
      process.env.BLOCKCHAIN_SIMULATION_MODE = 'false';
      const service = new CertificateBlockchainService();

      // Force live mode past the constructor's automatic simulation
      // fallback, to exercise the "genuinely no client configured" path
      // that would apply once initializeClient() is replaced with a real
      // Soroban client in the future.
      (service as unknown as { isSimulationMode: boolean }).isSimulationMode = false;

      await expect(service.getTransactionHistory('tok-1')).rejects.toThrow(
        BlockchainNotConfiguredError
      );
      await expect(service.getTransactionHistory('tok-1')).rejects.toMatchObject({
        code: 'BLOCKCHAIN_NOT_CONFIGURED',
      });
    });

    it('revokeCertificate rejects rather than silently succeeding when forced into live mode', async () => {
      process.env.CERTIFICATE_CONTRACT_ID = 'CCERTIFICATECONTRACTID';
      process.env.BLOCKCHAIN_SIMULATION_MODE = 'false';
      const service = new CertificateBlockchainService();
      (service as unknown as { isSimulationMode: boolean }).isSimulationMode = false;

      await expect(service.revokeCertificate('tok-1', 'test')).rejects.toThrow(Error);
    });

    it('mintCertificate degrades to a typed failure response via the circuit breaker fallback rather than throwing an untyped error', async () => {
      process.env.CERTIFICATE_CONTRACT_ID = 'CCERTIFICATECONTRACTID';
      process.env.BLOCKCHAIN_SIMULATION_MODE = 'false';
      const service = new CertificateBlockchainService();
      (service as unknown as { isSimulationMode: boolean }).isSimulationMode = false;

      const result = await service.mintCertificate({ verification: { tokenId: 'tok-2' } });

      // The circuit breaker's fallback swallows the thrown error into a
      // graceful `success: false` response by design (existing behavior,
      // preserved here) — the point of BlockchainNotConfiguredError is
      // that it's now a distinguishable, loggable type rather than a bare
      // Error, not that it always propagates to the caller.
      expect(result.success).toBe(false);
    });
  });
});
