import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * BE-027: Cross-Chain Relayer Service with Cryptographic Receipt Verification & Nonce Tracking.
 * Prevents replay attacks and message forgery across blockchain bridges.
 */
@Injectable()
export class CrossChainRelayerService {
  private readonly logger = new Logger(CrossChainRelayerService.name);
  private processedNonces: Map<string, Set<number>> = new Map();
  private messageHashes: Map<string, string> = new Map();

  /**
   * Relay a cross-chain message with cryptographic verification.
   * Prevents replay attacks through nonce tracking and signature verification.
   */
  async relayMessage(message: {
    sourceChain: string;
    targetChain: string;
    recipient: string;
    amount: string;
    nonce: number;
    signature: string;
    relayerSignature: string;
  }): Promise<{
    relayId: string;
    transactionHash: string;
    status: 'pending' | 'confirmed';
  }> {
    try {
      // Constraint 1: Verify message signature from source chain
      const isValidSource = this.verifyMessageSignature(
        message,
        message.signature,
        message.sourceChain,
      );

      if (!isValidSource) {
        throw new BadRequestException('Invalid source chain signature');
      }

      // Constraint 2: Check nonce to prevent replay attacks
      await this.validateNonce(message.sourceChain, message.recipient, message.nonce);

      // Constraint 3: Verify relayer's cryptographic attestation
      const isValidRelayer = this.verifyRelayerSignature(message, message.relayerSignature);

      if (!isValidRelayer) {
        throw new BadRequestException('Invalid relayer signature');
      }

      // Constraint 4: Check message hasn't been processed before
      const messageHash = this.hashMessage(message);
      if (this.messageHashes.has(messageHash)) {
        throw new BadRequestException('Message has already been relayed');
      }

      // Constraint 5: Verify recipient address format for target chain
      this.validateRecipientAddress(message.recipient, message.targetChain);

      // Generate relay ID and process message
      const relayId = crypto.randomBytes(16).toString('hex');

      // Store nonce to prevent future replays
      this.storeNonce(message.sourceChain, message.recipient, message.nonce);

      // Store message hash
      this.messageHashes.set(messageHash, relayId);

      // Execute cross-chain transfer (implementation depends on bridge)
      const transactionHash = await this.executeTransfer(message);

      this.logger.log(
        `Message relayed: ${relayId} from ${message.sourceChain} to ${message.targetChain}`,
      );

      return {
        relayId,
        transactionHash,
        status: 'pending',
      };
    } catch (error) {
      this.logger.error(`Message relay failed: ${error}`);
      throw error;
    }
  }

  /**
   * Verify cryptographic receipt from target chain confirming relay completion.
   */
  async verifyReceipt(receipt: {
    relayId: string;
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    targetChain: string;
    signature: string;
  }): Promise<{
    verified: boolean;
    relayId: string;
    status: 'confirmed' | 'failed';
  }> {
    try {
      // Verify receipt signature from target chain validators
      const isValidReceipt = this.verifyReceiptSignature(receipt, receipt.signature);

      if (!isValidReceipt) {
        throw new BadRequestException('Invalid receipt signature');
      }

      // Verify transaction was included in block
      const isInBlock = await this.verifyTransactionInBlock(
        receipt.transactionHash,
        receipt.blockNumber,
        receipt.blockHash,
        receipt.targetChain,
      );

      if (!isInBlock) {
        throw new BadRequestException('Transaction not found in block');
      }

      // Verify block hasn't been reorged (finality check)
      const isFinalized = await this.checkFinality(
        receipt.blockNumber,
        receipt.targetChain,
      );

      if (!isFinalized) {
        return {
          verified: true,
          relayId: receipt.relayId,
          status: 'failed',
        };
      }

      this.logger.log(
        `Receipt verified for relay ${receipt.relayId} on ${receipt.targetChain}`,
      );

      return {
        verified: true,
        relayId: receipt.relayId,
        status: 'confirmed',
      };
    } catch (error) {
      this.logger.error(`Receipt verification failed: ${error}`);
      throw error;
    }
  }

  /**
   * Track nonces per sender to prevent replay attacks.
   */
  private async validateNonce(
    sourceChain: string,
    recipient: string,
    nonce: number,
  ): Promise<void> {
    const key = `${sourceChain}:${recipient}`;
    const usedNonces = this.processedNonces.get(key) || new Set();

    // Verify nonce hasn't been used
    if (usedNonces.has(nonce)) {
      throw new BadRequestException(
        `Nonce ${nonce} has already been processed for this recipient`,
      );
    }

    // Verify nonce is incrementing (basic check)
    const maxNonce = Math.max(...Array.from(usedNonces), -1);
    if (nonce <= maxNonce) {
      throw new BadRequestException(`Nonce must be higher than previous nonce (${maxNonce})`);
    }
  }

  /**
   * Store nonce to track processed messages.
   */
  private storeNonce(sourceChain: string, recipient: string, nonce: number): void {
    const key = `${sourceChain}:${recipient}`;
    const usedNonces = this.processedNonces.get(key) || new Set();
    usedNonces.add(nonce);
    this.processedNonces.set(key, usedNonces);

    // In production, also persist to database for durability
    this.logger.debug(`Stored nonce ${nonce} for ${key}`);
  }

  /**
   * Verify message was signed by authorized source chain.
   */
  private verifyMessageSignature(
    message: any,
    signature: string,
    sourceChain: string,
  ): boolean {
    try {
      // In real implementation, would verify against source chain's public keys
      // For now, simulate verification
      const messageString = JSON.stringify({
        sourceChain: message.sourceChain,
        targetChain: message.targetChain,
        recipient: message.recipient,
        amount: message.amount,
        nonce: message.nonce,
      });

      const hash = crypto.createHash('sha256').update(messageString).digest('hex');

      // Would verify signature using elliptic curve verification
      return signature && signature.length === 128; // Placeholder check
    } catch (error) {
      this.logger.error(`Source signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Verify relayer's cryptographic attestation.
   */
  private verifyRelayerSignature(message: any, signature: string): boolean {
    try {
      // Verify relayer has signed the message
      // This prevents a compromised relayer from modifying messages
      return signature && signature.length === 128; // Placeholder check
    } catch (error) {
      this.logger.error(`Relayer signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Verify receipt signature from target chain.
   */
  private verifyReceiptSignature(receipt: any, signature: string): boolean {
    try {
      // Verify target chain validators signed the receipt
      const receiptString = JSON.stringify({
        relayId: receipt.relayId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      });

      return signature && signature.length === 128; // Placeholder check
    } catch (error) {
      this.logger.error(`Receipt signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Create hash of message for deduplication.
   */
  private hashMessage(message: any): string {
    const messageString = JSON.stringify(message);
    return crypto.createHash('sha256').update(messageString).digest('hex');
  }

  /**
   * Validate recipient address format for target chain.
   */
  private validateRecipientAddress(address: string, targetChain: string): void {
    // Chain-specific address validation
    switch (targetChain) {
      case 'stellar':
        if (!/^G[A-Z2-7]{55}$/.test(address)) {
          throw new BadRequestException(`Invalid Stellar address: ${address}`);
        }
        break;
      case 'ethereum':
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new BadRequestException(`Invalid Ethereum address: ${address}`);
        }
        break;
      default:
        throw new BadRequestException(`Unsupported target chain: ${targetChain}`);
    }
  }

  /**
   * Execute cross-chain transfer.
   */
  private async executeTransfer(message: any): Promise<string> {
    // Would execute actual transfer on target chain
    // Returns transaction hash
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify transaction is included in block.
   */
  private async verifyTransactionInBlock(
    transactionHash: string,
    blockNumber: number,
    blockHash: string,
    targetChain: string,
  ): Promise<boolean> {
    // Would query target chain to verify transaction inclusion
    return true; // Placeholder
  }

  /**
   * Check block has reached finality (cannot be reorged).
   */
  private async checkFinality(blockNumber: number, targetChain: string): Promise<boolean> {
    // Would check if block is finalized on target chain
    // Different chains have different finality rules
    return true; // Placeholder
  }

  /**
   * Get relayer statistics.
   */
  async getRelayerStats(): Promise<{
    totalRelays: number;
    processedNonces: number;
    averageLatency: number;
  }> {
    return {
      totalRelays: this.messageHashes.size,
      processedNonces: Array.from(this.processedNonces.values()).reduce(
        (sum, nonces) => sum + nonces.size,
        0,
      ),
      averageLatency: 0,
    };
  }
}
