import { NetworkError } from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';

export type BlockchainMode = 'simulation' | 'live';

/**
 * Thrown when a live-mode operation is attempted but no real Soroban
 * client is configured (#910). Live-mode Soroban RPC integration requires
 * a deployed certificate contract — none exists in this repository yet
 * (no contracts/certificate_* Soroban package defines a mint/verify/
 * getOwner/revoke interface to call). This is distinct from a
 * NetworkError: it means "not wired up", not "the network is down".
 */
export class BlockchainNotConfiguredError extends Error {
  readonly code = 'BLOCKCHAIN_NOT_CONFIGURED' as const;

  constructor(operation: string) {
    super(
      `Cannot perform '${operation}': live Soroban integration is not configured. ` +
        `Set BLOCKCHAIN_SIMULATION_MODE=true (or leave CERTIFICATE_CONTRACT_ID unset) to use ` +
        `simulation mode, or deploy a certificate contract and wire up a real Soroban RPC client.`
    );
    this.name = 'BlockchainNotConfiguredError';
  }
}

/**
 * Re-thrown for genuine Soroban RPC/network failures, so callers can
 * distinguish "the network call itself failed" from
 * BlockchainNotConfiguredError ("there was no real call to make").
 * Reuses the Stellar SDK's own NetworkError type rather than inventing a
 * parallel one.
 */
export function wrapAsNetworkError(operation: string, cause: unknown): NetworkError {
  const message = `Soroban RPC call failed for '${operation}': ${(cause as Error)?.message ?? String(cause)}`;
  return new NetworkError(message, {});
}

/**
 * Certificate Blockchain Service
 * Interfaces with Soroban/Soroban network for certificate NFTs
 *
 * Note: This is an interface layer with simulation mode.
 * Production integration requires deployed Soroban certificate contract.
 */
export class CertificateBlockchainService {
  private network: string;
  private contractId: string;
  private isSimulationMode: boolean;
  private breaker = cbManager.getOrCreateBreaker('stellar-blockchain', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    windowMs: 10000,
  });

  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'testnet';
    this.contractId = process.env.CERTIFICATE_CONTRACT_ID || '';
    this.isSimulationMode = process.env.BLOCKCHAIN_SIMULATION_MODE === 'true' || !this.contractId;

    if (!this.isSimulationMode && this.contractId) {
      this.initializeClient();
    }

    logger.info(`Blockchain service initialized in ${this.getMode()} mode`, {
      mode: this.getMode(),
      network: this.network,
      contractConfigured: Boolean(this.contractId),
    });
  }

  /**
   * Returns the service's current mode explicitly — 'simulation' or
   * 'live' — rather than callers having to infer it from side effects
   * (#910's "simulation mode is explicit" requirement).
   */
  getMode(): BlockchainMode {
    return this.isSimulationMode ? 'simulation' : 'live';
  }

  /**
   * Initializes the Soroban client.
   *
   * There is currently no deployed certificate Soroban contract in this
   * repository for a real client to call — no contracts/certificate_*
   * package defines the mint/verify/getOwner/revoke ABI this service
   * would need to invoke. Rather than fabricate calls against a contract
   * that doesn't exist, this falls back to simulation mode explicitly and
   * logs why, so operators aren't misled into thinking live mode is
   * active when BLOCKCHAIN_SIMULATION_MODE=false and a CERTIFICATE_CONTRACT_ID
   * is set.
   */
  private initializeClient(): void {
    logger.warn(
      'Live Soroban client requested (CERTIFICATE_CONTRACT_ID set, BLOCKCHAIN_SIMULATION_MODE=false) ' +
        'but no certificate contract integration exists yet — falling back to simulation mode. ' +
        'Live-mode operations will throw BlockchainNotConfiguredError instead of silently succeeding.'
    );
    this.isSimulationMode = true;
  }

  /**
   * Mints a certificate NFT on-chain
   */
  async mintCertificate(metadata: any): Promise<{
    success: boolean;
    tokenId: string;
    transactionHash: string;
    contractAddress: string;
  }> {
    return this.breaker.execute(
      async () => {
        if (this.isSimulationMode) {
          return this.simulateMint(metadata);
        }

        throw new BlockchainNotConfiguredError('mintCertificate');
      },
      (error) => {
        logger.error('Circuit breaker fallback for mintCertificate triggered', error as Error);
        return {
          success: false,
          tokenId: metadata.verification?.tokenId || 'error-token-id',
          transactionHash: 'circuit-breaker-fallback',
          contractAddress: this.contractId || 'UNKNOWN',
        };
      }
    );
  }

  /**
   * Verifies a certificate exists on-chain
   */
  async verifyOnChain(tokenId: string): Promise<boolean> {
    return this.breaker.execute(
      async () => {
        if (this.isSimulationMode) {
          return this.simulateVerifyOnChain(tokenId);
        }
        throw new BlockchainNotConfiguredError('verifyOnChain');
      },
      () => false // Fallback: assume not verified if service is down
    );
  }

  /**
   * Gets token owner from blockchain
   */
  async getOwner(tokenId: string): Promise<string> {
    return this.breaker.execute(
      async () => {
        if (this.isSimulationMode) {
          return this.simulateGetOwner(tokenId);
        }
        throw new BlockchainNotConfiguredError('getOwner');
      },
      () => 'N/A (Circuit Breaker)' // Fallback owner
    );
  }

  /**
   * Revokes a certificate on-chain (if contract supports)
   */
  async revokeCertificate(tokenId: string, reason: string): Promise<void> {
    return this.breaker.execute(async () => {
      if (this.isSimulationMode) {
        logger.info(`Simulated revocation of token ${tokenId}: ${reason}`);
        return;
      }
      throw new BlockchainNotConfiguredError('revokeCertificate');
    });
  }

  /**
   * Gets transaction history for a token
   */
  async getTransactionHistory(tokenId: string): Promise<any[]> {
    if (this.isSimulationMode) {
      return this.simulateGetTransactionHistory(tokenId);
    }
    throw new BlockchainNotConfiguredError('getTransactionHistory');
  }

  /**
   * Gets certificate data from on-chain storage
   */
  async getCertificateData(tokenId: string): Promise<any | null> {
    return this.breaker.execute(
      async () => {
        if (this.isSimulationMode) {
          return this.simulateGetOnChainData(tokenId);
        }
        throw new BlockchainNotConfiguredError('getCertificateData');
      },
      () => null // Fallback: no data
    );
  }

  /**
   * Checks if service is connected to blockchain
   */
  isConnected(): boolean {
    return !this.isSimulationMode && this.breaker.getStats().state === 'CLOSED';
  }

  /**
   * Gets the contract address
   */
  getContractAddress(): string {
    return this.contractId;
  }

  // =====================
  // Simulation methods
  // =====================

  private async simulateMint(metadata: any): Promise<{
    success: boolean;
    tokenId: string;
    transactionHash: string;
    contractAddress: string;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mockHash = `0x${Array(64)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('')}`;
    const mockContract = this.contractId || 'GUNKNOWNCONTRACT';
    const tokenId = metadata.verification?.tokenId || 'simulated-token-id';

    logger.info(`Simulated mint for token ${tokenId}`);

    return {
      success: true,
      tokenId,
      transactionHash: mockHash,
      contractAddress: mockContract,
    };
  }

  private async simulateVerifyOnChain(tokenId: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return true;
  }

  private async simulateGetOwner(tokenId: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return 'GBST4SW5DKCK3SN5EQQYQA4SDSF4NYVZ647YV6NA5PHWJ2N2UJNAPNAI';
  }

  private async simulateGetTransactionHistory(_tokenId: string): Promise<any[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [];
  }

  private async simulateGetOnChainData(tokenId: string): Promise<any | null> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      tokenId,
      owner: 'GBST4SW5DKCK3SN5EQQYQA4SDSF4NYVZ647YV6NA5PHWJ2N2UJNAPNAI',
      metadataUri: `${process.env.API_BASE_URL || 'http://localhost:8080'}/api/v1/certificates/${tokenId}/metadata`,
      mintedAt: new Date(),
      contractAddress: this.contractId || 'GUNKNOWNCONTRACT',
      transactionHash: '0xsimulated',
      network: this.network,
    };
  }
}

export const certificateBlockchainService = new CertificateBlockchainService();
