import {
  Horizon,
  Server,
  TransactionBuilder,
  Asset,
  Operation,
  Networks,
  Keypair,
  Account,
  StrKey,
  AuthRevocableFlag,
  AuthRequiredFlag,
  AuthClawbackEnabledFlag,
} from '@stellar/stellar-sdk';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Server(HORIZON_URL);

export interface StellarAssetInfo {
  code: string;
  issuer: string;
  supply: string;
  clawbackEnabled: boolean;
  authRequired: boolean;
  authRevocable: boolean;
  trustlines: StellarTrustlineInfo[];
}

export interface StellarTrustlineInfo {
  accountId: string;
  balance: string;
  limit: string;
  authorized: boolean;
  authorizedToMaintainLiabilities: boolean;
}

export interface ClawbackParams {
  from: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
}

/**
 * Get all assets issued by a specific account
 */
export const getAssetsByIssuer = async (issuer: string): Promise<StellarAssetInfo[]> => {
  try {
    const assets = await server.assets().forIssuer(issuer).call();

    const assetInfos: StellarAssetInfo[] = [];

    for (const record of assets.records) {
      const trustlines = await getTrustlinesForAsset(record.asset_code, record.asset_issuer);

      assetInfos.push({
        code: record.asset_code,
        issuer: record.asset_issuer,
        supply: record.amount,
        clawbackEnabled: record.flags.auth_clawback_enabled || false,
        authRequired: record.flags.auth_required || false,
        authRevocable: record.flags.auth_revocable || false,
        trustlines,
      });
    }

    return assetInfos;
  } catch (error) {
    console.error('Error fetching assets:', error);
    throw error;
  }
};

/**
 * Get trustlines for a specific asset
 */
export const getTrustlinesForAsset = async (
  assetCode: string,
  assetIssuer: string
): Promise<StellarTrustlineInfo[]> => {
  try {
    // Get all accounts that have trustlines for this asset
    const trustlines = await server.trustlines().forAsset(new Asset(assetCode, assetIssuer)).call();

    return trustlines.records.map((record) => ({
      accountId: record.account_id,
      balance: record.balance,
      limit: record.limit,
      authorized: record.authorized || false,
      authorizedToMaintainLiabilities: record.authorized_to_maintain_liabilities || false,
    }));
  } catch (error) {
    console.error('Error fetching trustlines:', error);
    return [];
  }
};

/**
 * Build a transaction to update asset flags
 */
export const buildUpdateFlagsTransaction = async (
  issuerKeypair: Keypair,
  assetCode: string,
  flags: {
    clawbackEnabled?: boolean;
    authRequired?: boolean;
    authRevocable?: boolean;
  }
): Promise<string> => {
  try {
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const setOptionsOp = Operation.setOptions({
      // Set flags based on parameters
      setFlags: [
        ...(flags.authRequired ? [AuthRequiredFlag] : []),
        ...(flags.authRevocable ? [AuthRevocableFlag] : []),
        ...(flags.clawbackEnabled ? [AuthClawbackEnabledFlag] : []),
      ],
      clearFlags: [
        ...(!flags.authRequired ? [AuthRequiredFlag] : []),
        ...(!flags.authRevocable ? [AuthRevocableFlag] : []),
        ...(!flags.clawbackEnabled ? [AuthClawbackEnabledFlag] : []),
      ],
    });

    const transaction = new TransactionBuilder(issuerAccount, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(setOptionsOp)
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);

    return transaction.toXDR();
  } catch (error) {
    console.error('Error building update flags transaction:', error);
    throw error;
  }
};

/**
 * Build a clawback transaction
 */
export const buildClawbackTransaction = async (
  issuerKeypair: Keypair,
  params: ClawbackParams
): Promise<string> => {
  try {
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const clawbackOp = Operation.clawback({
      from: params.from,
      asset: new Asset(params.assetCode, params.assetIssuer),
      amount: params.amount,
    });

    const transaction = new TransactionBuilder(issuerAccount, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(clawbackOp)
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);

    return transaction.toXDR();
  } catch (error) {
    console.error('Error building clawback transaction:', error);
    throw error;
  }
};

/**
 * Submit a signed transaction to the network
 */
export const submitTransaction = async (
  xdr: string
): Promise<Horizon.SubmitTransactionResponse> => {
  try {
    const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    const result = await server.submitTransaction(transaction);
    return result;
  } catch (error) {
    console.error('Error submitting transaction:', error);
    throw error;
  }
};

/**
 * Revoke authorization for a trustline
 */
export const buildRevokeTrustlineTransaction = async (
  issuerKeypair: Keypair,
  accountId: string,
  assetCode: string,
  assetIssuer: string
): Promise<string> => {
  try {
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const revokeOp = Operation.setTrustLineFlags({
      trustor: accountId,
      asset: new Asset(assetCode, assetIssuer),
      flags: {
        authorized: false,
      },
    });

    const transaction = new TransactionBuilder(issuerAccount, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(revokeOp)
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);

    return transaction.toXDR();
  } catch (error) {
    console.error('Error building revoke transaction:', error);
    throw error;
  }
};

/**
 * Grant authorization for a trustline
 */
export const buildGrantTrustlineTransaction = async (
  issuerKeypair: Keypair,
  accountId: string,
  assetCode: string,
  assetIssuer: string
): Promise<string> => {
  try {
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const grantOp = Operation.setTrustLineFlags({
      trustor: accountId,
      asset: new Asset(assetCode, assetIssuer),
      flags: {
        authorized: true,
      },
    });

    const transaction = new TransactionBuilder(issuerAccount, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(grantOp)
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);

    return transaction.toXDR();
  } catch (error) {
    console.error('Error building grant transaction:', error);
    throw error;
  }
};

/**
 * Validate Stellar address
 */
export const isValidStellarAddress = (address: string): boolean => {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
};

/**
 * Format Stellar address for display
 */
export const formatStellarAddress = (address: string, chars: number = 4): string => {
  if (!isValidStellarAddress(address)) {
    return address;
  }

  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

/**
 * Get account details
 */
export const getAccountDetails = async (accountId: string): Promise<Account> => {
  try {
    const account = await server.loadAccount(accountId);
    return account;
  } catch (error) {
    console.error('Error fetching account details:', error);
    throw error;
  }
};

/**
 * Check if an account exists
 */
export const accountExists = async (accountId: string): Promise<boolean> => {
  try {
    await server.loadAccount(accountId);
    return true;
  } catch {
    return false;
  }
};
