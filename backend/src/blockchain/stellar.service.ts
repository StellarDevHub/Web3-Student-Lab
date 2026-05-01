import { Server, TransactionBuilder, Networks, Operation, Asset, Keypair } from 'stellar-sdk';
import logger from '../utils/logger.js';

interface PaymentResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  message?: string;
}

interface RefundResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  message?: string;
}

export class StellarService {
  private server: Server;
  private treasuryKeypair: Keypair;

  constructor() {
    this.server = new Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
    this.treasuryKeypair = Keypair.fromSecret(process.env.STELLAR_TREASURY_SECRET || '');
  }

  async processSubscriptionPayment(data: {
    userId: string;
    amount: number;
    currency: string;
    subscriptionId: number;
  }): Promise<PaymentResult> {
    try {
      const sourceAccount = await this.server.loadAccount(this.treasuryKeypair.publicKey());
      
      // Create payment transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: await this.server.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET
      })
        .addOperation(Operation.payment({
          destination: process.env.STELLAR_TREASURY_PUBLIC_KEY!,
          asset: Asset.native(),
          amount: (data.amount / 10000000).toString(), // Convert from stroops to XLM
        }))
        .addMemo(`Subscription payment for user ${data.userId}, subscription ${data.subscriptionId}`)
        .setTimeout(30)
        .build();

      transaction.sign(this.treasuryKeypair);

      const result = await this.server.submitTransaction(transaction);
      
      logger.info(`Payment processed successfully: ${result.hash}`);
      
      return {
        transactionId: result.hash,
        status: 'SUCCESS'
      };
    } catch (error) {
      logger.error('Payment processing failed:', error);
      
      return {
        transactionId: '',
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processRefund(data: {
    userId: string;
    amount: number;
    currency: string;
    originalTransactionId?: string;
  }): Promise<RefundResult> {
    try {
      const sourceAccount = await this.server.loadAccount(this.treasuryKeypair.publicKey());
      
      // Create refund transaction (in real implementation, this would send to user's wallet)
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: await this.server.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET
      })
        .addOperation(Operation.payment({
          destination: this.treasuryKeypair.publicKey(), // In real implementation, this would be user's wallet
          asset: Asset.native(),
          amount: (data.amount / 10000000).toString(),
        }))
        .addMemo(`Refund for user ${data.userId}, original transaction ${data.originalTransactionId}`)
        .setTimeout(30)
        .build();

      transaction.sign(this.treasuryKeypair);

      const result = await this.server.submitTransaction(transaction);
      
      logger.info(`Refund processed successfully: ${result.hash}`);
      
      return {
        transactionId: result.hash,
        status: 'SUCCESS'
      };
    } catch (error) {
      logger.error('Refund processing failed:', error);
      
      return {
        transactionId: '',
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getAccountBalance(accountId: string): Promise<string> {
    try {
      const account = await this.server.loadAccount(accountId);
      const balance = account.balances.find(b => b.asset_type === 'native');
      return balance?.balance || '0';
    } catch (error) {
      logger.error('Error fetching account balance:', error);
      throw error;
    }
  }

  async validateTransaction(transactionId: string): Promise<boolean> {
    try {
      const transaction = await this.server.transactions().transaction(transactionId).call();
      return transaction.successful;
    } catch (error) {
      logger.error('Error validating transaction:', error);
      return false;
    }
  }
}
