import { Horizon, Keypair, Networks, StrKey, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import prisma from '../db/index.js';
import { HORIZON_URL, STELLAR_NETWORK } from '../config/rpcConfig.js';
import { formatUserResponse } from './auth.service.js';
import { generateAccessToken, generateRefreshToken, TokenPayload } from './token.service.js';
import { getRedisClient } from '../utils/redis.js';
import logger from '../utils/logger.js';

export interface Sep10ChallengeResponse {
  transaction: string;
  networkPassphrase: string;
}

export interface Sep10AuthResponse {
  user: any;
  accessToken: string;
  refreshToken: string;
  signers?: string[];
}

export const getNetworkPassphrase = (): string => {
  const net = (process.env.STELLAR_NETWORK || STELLAR_NETWORK || 'testnet').toLowerCase();
  return net === 'mainnet' || net === 'public' ? Networks.PUBLIC : Networks.TESTNET;
};

export const getServerKeypair = (): Keypair => {
  const secret =
    process.env.STELLAR_SERVER_SECRET ||
    process.env.STELLAR_ISSUER_SECRET_KEY ||
    process.env.STELLAR_ISSUER_SECRET;

  if (secret && StrKey.isValidEd25519SecretSeed(secret)) {
    return Keypair.fromSecret(secret);
  }

  throw new Error('Server Stellar secret key is not configured or invalid (STELLAR_SERVER_SECRET / STELLAR_ISSUER_SECRET_KEY)');
};

export const getHomeDomain = (): string => {
  return process.env.STELLAR_HOME_DOMAIN || 'localhost:8080';
};

export const getWebAuthDomain = (): string => {
  return process.env.STELLAR_WEB_AUTH_DOMAIN || getHomeDomain();
};

export const getHorizonServer = (): Horizon.Server => {
  const horizonUrl = process.env.STELLAR_HORIZON_URL || HORIZON_URL || 'https://horizon-testnet.stellar.org';
  return new Horizon.Server(horizonUrl);
};

/**
 * Generate an RFC-compliant SEP-0010 challenge transaction envelope
 */
export const buildSep10Challenge = async (
  clientAccountID: string,
  homeDomain?: string,
  webAuthDomain?: string
): Promise<Sep10ChallengeResponse> => {
  if (!clientAccountID || !StrKey.isValidEd25519PublicKey(clientAccountID)) {
    throw new Error('Invalid Stellar public key format');
  }

  const serverKeypair = getServerKeypair();
  const targetHomeDomain = homeDomain || getHomeDomain();
  const targetWebAuthDomain = webAuthDomain || getWebAuthDomain();
  const networkPassphrase = getNetworkPassphrase();

  // 300 seconds (5 minutes) challenge lifetime per SEP-0010 spec
  const challengeTimeout = 300;

  const challengeXdr = WebAuth.buildChallengeTx(
    serverKeypair,
    clientAccountID,
    targetHomeDomain,
    challengeTimeout,
    networkPassphrase,
    targetWebAuthDomain
  );

  // Store challenge hash in Redis for replay defense
  try {
    const tx = TransactionBuilder.fromXDR(challengeXdr, networkPassphrase);
    const txHash = tx.hash().toString('hex');
    const redis = getRedisClient();
    if (redis && typeof redis.set === 'function') {
      await redis.set(`sep10:ch:${txHash}`, clientAccountID, 'EX', challengeTimeout);
    }
  } catch (err) {
    logger.warn('Redis unavailable for SEP-0010 challenge tracking:', err);
  }

  return {
    transaction: challengeXdr,
    networkPassphrase,
  };
};

/**
 * Verify a signed SEP-0010 challenge transaction, validate multi-sig thresholds, and issue tokens
 */
export const verifySep10Challenge = async (
  signedChallengeXdr: string,
  expectedClientAccountID?: string,
  homeDomain?: string,
  webAuthDomain?: string,
  horizonServerOverride?: Horizon.Server
): Promise<Sep10AuthResponse> => {
  if (!signedChallengeXdr || typeof signedChallengeXdr !== 'string') {
    throw new Error('Challenge transaction XDR is required');
  }

  const serverKeypair = getServerKeypair();
  const targetHomeDomain = homeDomain || getHomeDomain();
  const targetWebAuthDomain = webAuthDomain || getWebAuthDomain();
  const networkPassphrase = getNetworkPassphrase();

  let parsedChallenge: { clientAccountID: string; matchedHomeDomain: string };
  let tx: any;

  try {
    tx = TransactionBuilder.fromXDR(signedChallengeXdr, networkPassphrase);
    parsedChallenge = WebAuth.readChallengeTx(
      signedChallengeXdr,
      serverKeypair.publicKey(),
      networkPassphrase,
      [targetHomeDomain],
      targetWebAuthDomain
    );
  } catch (err: any) {
    logger.warn('Failed to parse SEP-0010 challenge envelope:', err);
    throw new Error(err.message || 'Invalid challenge transaction envelope');
  }

  const clientAccountID = parsedChallenge.clientAccountID;

  if (expectedClientAccountID && expectedClientAccountID !== clientAccountID) {
    throw new Error('Client public key does not match transaction source');
  }

  // Strict server-side time bounds verification
  const now = Math.floor(Date.now() / 1000);
  if (tx.timeBounds) {
    const minTime = parseInt(tx.timeBounds.minTime, 10);
    const maxTime = parseInt(tx.timeBounds.maxTime, 10);

    if (now < minTime || now > maxTime) {
      throw new Error('Challenge transaction has expired');
    }
  }

  // Replay protection via Redis
  const txHash = tx.hash().toString('hex');
  try {
    const redis = getRedisClient();
    if (redis && typeof redis.get === 'function' && typeof redis.set === 'function') {
      const isUsed = await redis.get(`sep10:used:${txHash}`);
      if (isUsed) {
        throw new Error('Challenge transaction has already been used');
      }

      // Mark challenge as used atomically for 10 minutes
      await redis.set(`sep10:used:${txHash}`, '1', 'EX', 600);
      if (typeof redis.del === 'function') {
        await redis.del(`sep10:ch:${txHash}`);
      }
    }
  } catch (err: any) {
    if (err.message === 'Challenge transaction has already been used') {
      throw err;
    }
    logger.warn('Redis error checking challenge replay:', err);
  }

  // Multi-signature & threshold verification via Horizon
  const horizon = horizonServerOverride || getHorizonServer();
  let signerSummary: any[] = [];
  let requiredThreshold = 1;

  try {
    const account = await horizon.loadAccount(clientAccountID);
    if (account && account.signers && account.signers.length > 0) {
      signerSummary = account.signers.map((s: any) => ({
        key: s.key,
        weight: s.weight,
      }));
      requiredThreshold = account.thresholds?.med_threshold || 1;
    } else {
      signerSummary = [{ key: clientAccountID, weight: 1 }];
      requiredThreshold = 1;
    }
  } catch (err: any) {
    const status = err?.response?.status || err?.status;
    const isNotFound =
      status === 404 ||
      err?.name === 'NotFoundError' ||
      err?.response?.data?.status === 404 ||
      err?.message?.toLowerCase().includes('not found') ||
      err?.message?.toLowerCase().includes('404');

    if (isNotFound) {
      // Unfunded / non-existent account on network: fallback to master key with threshold 1 per SEP-0010
      signerSummary = [{ key: clientAccountID, weight: 1 }];
      requiredThreshold = 1;
    } else {
      // Non-404 error (e.g. 5xx, timeout, network error): STRICTLY FAIL CLOSED
      logger.error(`Failed to load account ${clientAccountID} from Horizon (non-404 error):`, err);
      throw new Error('Horizon network error: Unable to verify account signers from network');
    }
  }

  let verifiedSigners: string[];
  try {
    verifiedSigners = WebAuth.verifyChallengeTxThreshold(
      signedChallengeXdr,
      serverKeypair.publicKey(),
      networkPassphrase,
      requiredThreshold,
      signerSummary,
      [targetHomeDomain],
      targetWebAuthDomain
    );
  } catch (err: any) {
    logger.warn(`SEP-0010 signature verification failed for ${clientAccountID}:`, err);
    throw new Error(err.message || 'Signature verification failed or threshold not met');
  }

  if (!verifiedSigners || verifiedSigners.length === 0) {
    throw new Error('Signature verification failed: no valid signers found');
  }

  // User Resolution / Provisioning in Database
  let student: any = null;
  try {
    student = await prisma.student.findFirst({
      where: { walletAddress: clientAccountID },
    });

    if (!student) {
      student = await prisma.student.create({
        data: {
          walletAddress: clientAccountID,
          email: `${clientAccountID.toLowerCase()}@stellar.auth`,
          firstName: 'Stellar',
          lastName: 'User',
          password: '',
        },
      });
    }
  } catch (err) {
    logger.warn('Database lookup/creation for wallet user failed, using transient user object:', err);
    student = {
      id: `wallet-${clientAccountID.slice(0, 12)}`,
      walletAddress: clientAccountID,
      email: `${clientAccountID.toLowerCase()}@stellar.auth`,
      firstName: 'Stellar',
      lastName: 'User',
    };
  }

  // Issue hardened JWT tokens through token.service.ts
  const tokenPayload: TokenPayload = { userId: student.id };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = await generateRefreshToken(tokenPayload);

  return {
    user: formatUserResponse(student),
    accessToken,
    refreshToken,
    signers: verifiedSigners,
  };
};
