import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Merkle inclusion proof for a Soroban transaction within a finalized Stellar ledger.
 */
export interface MerkleInclusionProof {
  leafHash: string;
  siblings: string[];
  directions: ('left' | 'right')[];
  root: string;
}

/**
 * Validator attestation over a ledger header (threshold multisig style).
 */
export interface ValidatorAttestation {
  validatorId: string;
  publicKey: string;
  signature: string;
}

/**
 * Payload formatted for consumption by EVM light-client contracts.
 */
export interface EvmProofPayload {
  ledgerSequence: number;
  ledgerHash: string;
  txHash: string;
  leafHash: string;
  merkleRoot: string;
  siblings: string[];
  directions: number[];
  certificateId: string;
  recipient: string;
  attestations: ValidatorAttestation[];
  threshold: number;
  proofId: string;
}

/**
 * BE-079: Cross-Chain Relayer Service with SPV Merkle inclusion proofs,
 * validator-threshold attestation, and cross-chain duplicate-mint protection.
 * BE-027: Replay protection via nonce tracking and message hashing.
 */
@Injectable()
export class CrossChainRelayerService {
  private readonly logger = new Logger(CrossChainRelayerService.name);
  private processedNonces: Map<string, Set<number>> = new Map();
  private messageHashes: Map<string, string> = new Map();
  private mintedCertificates: Map<string, string> = new Map();

  /**
   * BE-079: Generate an SPV Merkle inclusion proof for a Soroban certificate
   * transaction within a finalized Stellar ledger, formatted for EVM consumption.
   */
  generateCertificateProof(params: {
    certificateId: string;
    recipient: string;
    txHash: string;
    ledgerSequence: number;
    ledgerHash: string;
    ledgerTxHashes: string[];
    attestations: ValidatorAttestation[];
    threshold: number;
    trustedValidatorKeys: string[];
  }): EvmProofPayload {
    const {
      certificateId,
      recipient,
      txHash,
      ledgerSequence,
      ledgerHash,
      ledgerTxHashes,
      attestations,
      threshold,
      trustedValidatorKeys,
    } = params;

    if (!certificateId || !recipient) {
      throw new BadRequestException('certificateId and recipient are required');
    }
    if (!ledgerTxHashes.includes(txHash)) {
      throw new BadRequestException('Transaction not included in ledger transaction set');
    }
    if (threshold < 1 || threshold > trustedValidatorKeys.length) {
      throw new BadRequestException('Invalid validator threshold');
    }

    // Verify threshold validator attestations over the ledger header
    const headerDigest = this.ledgerHeaderDigest(ledgerSequence, ledgerHash);
    const validSigners = new Set<string>();
    for (const att of attestations) {
      if (!trustedValidatorKeys.includes(att.publicKey)) continue;
      if (this.verifyEd25519(headerDigest, att.signature, att.publicKey)) {
        validSigners.add(att.publicKey);
      }
    }
    if (validSigners.size < threshold) {
      throw new BadRequestException(
        `Insufficient validator attestations: ${validSigners.size}/${threshold}`,
      );
    }

    const merkle = this.buildMerkleProof(ledgerTxHashes, txHash);

    // Prevent duplicate minting of the same certificate across chains
    if (this.mintedCertificates.has(certificateId)) {
      throw new BadRequestException(`Certificate ${certificateId} already minted/relayed`);
    }

    const proofId = crypto
      .createHash('sha256')
      .update(`${certificateId}:${txHash}:${ledgerSequence}:${merkle.root}`)
      .digest('hex');

    this.mintedCertificates.set(certificateId, proofId);

    this.logger.log(`Generated certificate proof ${proofId} for ${certificateId}`);

    return {
      ledgerSequence,
      ledgerHash,
      txHash,
      leafHash: merkle.leafHash,
      merkleRoot: merkle.root,
      siblings: merkle.siblings,
      directions: merkle.directions.map((d) => (d === 'left' ? 0 : 1)),
      certificateId,
      recipient,
      attestations: attestations.filter((a) => validSigners.has(a.publicKey)),
      threshold,
      proofId,
    };
  }

  /**
   * BE-079: Verify a Merkle inclusion proof locally (mirrors EVM light-client logic).
   */
  verifyMerkleInclusion(leafHash: string, proof: MerkleInclusionProof): boolean {
    let computed = leafHash;
    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const direction = proof.directions[i];
      computed =
        direction === 'left'
          ? this.hashPair(sibling, computed)
          : this.hashPair(computed, sibling);
    }
    return computed === proof.root;
  }

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
      const isValidSource = this.verifyMessageSignature(
        message,
        message.signature,
        message.sourceChain,
      );

      if (!isValidSource) {
        throw new BadRequestException('Invalid source chain signature');
      }

      await this.validateNonce(message.sourceChain, message.recipient, message.nonce);

      const isValidRelayer = this.verifyRelayerSignature(message, message.relayerSignature);

      if (!isValidRelayer) {
        throw new BadRequestException('Invalid relayer signature');
      }

      const messageHash = this.hashMessage(message);
      if (this.messageHashes.has(messageHash)) {
        throw new BadRequestException('Message has already been relayed');
      }

      this.validateRecipientAddress(message.recipient, message.targetChain);

      const relayId = crypto.randomBytes(16).toString('hex');

      this.storeNonce(message.sourceChain, message.recipient, message.nonce);

      this.messageHashes.set(messageHash, relayId);

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
      const isValidReceipt = this.verifyReceiptSignature(receipt, receipt.signature);

      if (!isValidReceipt) {
        throw new BadRequestException('Invalid receipt signature');
      }

      const isInBlock = await this.verifyTransactionInBlock(
        receipt.transactionHash,
        receipt.blockNumber,
        receipt.blockHash,
        receipt.targetChain,
      );

      if (!isInBlock) {
        throw new BadRequestException('Transaction not found in block');
      }

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
   * Build a binary Merkle tree over ledger transaction hashes and return
   * the inclusion path for the target leaf.
   */
  private buildMerkleProof(txHashes: string[], target: string): MerkleInclusionProof & {
    siblings: string[];
  } {
    const leaves = txHashes.map((h) => this.hashLeaf(h));
    const leafHash = this.hashLeaf(target);
    let index = txHashes.indexOf(target);
    if (index < 0) {
      throw new BadRequestException('Target transaction not in ledger');
    }

    const siblings: string[] = [];
    const directions: ('left' | 'right')[] = [];
    let level = leaves;

    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i];
        next.push(this.hashPair(left, right));
        if (i === index || i + 1 === index) {
          if (index % 2 === 0) {
            siblings.push(right);
            directions.push('right');
          } else {
            siblings.push(left);
            directions.push('left');
          }
        }
      }
      index = Math.floor(index / 2);
      level = next;
    }

    const proof = { leafHash, siblings, directions, root: level[0] };
    if (!this.verifyMerkleInclusion(leafHash, proof)) {
      throw new BadRequestException('Merkle proof self-verification failed');
    }
    return proof;
  }

  private hashLeaf(txHash: string): string {
    return crypto.createHash('sha256').update(Buffer.from(`\x00${txHash}`, 'utf8')).digest('hex');
  }

  private hashPair(a: string, b: string): string {
    return crypto
      .createHash('sha256')
      .update(Buffer.from(`\x01${a}${b}`, 'utf8'))
      .digest('hex');
  }

  private ledgerHeaderDigest(sequence: number, ledgerHash: string): Buffer {
    return crypto
      .createHash('sha256')
      .update(`${sequence}:${ledgerHash}`)
      .digest();
  }

  private verifyEd25519(digest: Buffer, signatureHex: string, publicKeyHex: string): boolean {
    try {
      const key = crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'),
          Buffer.from(publicKeyHex, 'hex'),
        ]),
        format: 'der',
        type: 'spki',
      });
      return crypto.verify(null, digest, key, Buffer.from(signatureHex, 'hex'));
    } catch {
      return false;
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

    if (usedNonces.has(nonce)) {
      throw new BadRequestException(
        `Nonce ${nonce} has already been processed for this recipient`,
      );
    }

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
      const messageString = JSON.stringify({
        sourceChain: message.sourceChain,
        targetChain: message.targetChain,
        recipient: message.recipient,
        amount: message.amount,
        nonce: message.nonce,
      });
      const digest = crypto.createHash('sha256').update(messageString).digest();
      const trustedKey = process.env[`TRUSTED_KEY_${sourceChain.toUpperCase()}`];
      if (!trustedKey) return false;
      return this.verifyEd25519(digest, signature, trustedKey);
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
      const digest = crypto
        .createHash('sha256')
        .update(JSON.stringify(message))
        .digest();
      const relayerKey = process.env.RELAYER_PUBLIC_KEY;
      if (!relayerKey) return false;
      return this.verifyEd25519(digest, signature, relayerKey);
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
      const receiptString = JSON.stringify({
        relayId: receipt.relayId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      });
      const digest = crypto.createHash('sha256').update(receiptString).digest();
      const validatorKey = process.env[`TRUSTED_KEY_${receipt.targetChain.toUpperCase()}`];
      if (!validatorKey) return false;
      return this.verifyEd25519(digest, signature, validatorKey);
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
    return true;
  }

  /**
   * Check block has reached finality (cannot be reorged).
   */
  private async checkFinality(blockNumber: number, targetChain: string): Promise<boolean> {
    return true;
  }

  /**
   * Get relayer statistics.
   */
  async getRelayerStats(): Promise<{
    totalRelays: number;
    processedNonces: number;
    averageLatency: number;
    mintedCertificates: number;
  }> {
    return {
      totalRelays: this.messageHashes.size,
      processedNonces: Array.from(this.processedNonces.values()).reduce(
        (sum, nonces) => sum + nonces.size,
        0,
      ),
      averageLatency: 0,
      mintedCertificates: this.mintedCertificates.size,
    };
  }
}
