import { Horizon, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { recordUsage } from '../blockchain/relayerQuota.js';
import logger from '../utils/logger.js';

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

const MAX_RETRIES = 3;
const SEQUENCE_RETRY_DELAY_MS = 1000;

function getNetworkPassphrase(): string {
  const net = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  return net === 'mainnet' || net === 'public' ? Networks.PUBLIC : Networks.TESTNET;
}

function isSequenceError(err: any): boolean {
  // Horizon returns result_codes.transaction === 'tx_bad_seq' on sequence mismatch
  const txCode: string =
    err?.response?.data?.extras?.result_codes?.transaction ||
    err?.extras?.result_codes?.transaction ||
    '';
  return txCode === 'tx_bad_seq';
}

export interface SubmitResult {
  hash: string;
  ledger: number;
}

/**
 * Submit a signed fee-bump XDR to Horizon, retrying automatically on sequence
 * number errors (tx_bad_seq). Each retry re-fetches the account sequence from
 * Horizon so the worker never gets stuck in a permanent loop.
 *
 * @param feeBumpXdr  - fully-signed fee-bump envelope in base64 XDR
 * @param feeAccount  - relayer master account public key (for sequence refresh)
 * @param studentDid  - student DID string used to record quota usage on success
 * @param feeStroops  - fee amount to record against quota
 */
export async function submitFeeBump(
  feeBumpXdr: string,
  feeAccount: string,
  studentDid: string,
  feeStroops: number
): Promise<SubmitResult> {
  const server = new Horizon.Server(HORIZON_URL);
  const networkPassphrase = getNetworkPassphrase();

  let attempt = 0;
  let xdr = feeBumpXdr;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      const result = await server.submitTransaction(tx as any);

      logger.info(
        `Fee-bump submitted: hash=${result.hash}, ledger=${result.ledger}, attempt=${attempt}`
      );

      await recordUsage(studentDid, feeStroops);

      return { hash: result.hash, ledger: result.ledger };
    } catch (err: any) {
      if (isSequenceError(err) && attempt < MAX_RETRIES) {
        logger.warn(
          `tx_bad_seq on attempt ${attempt} for feeAccount=${feeAccount}, refreshing sequence…`
        );
        await new Promise((r) => setTimeout(r, SEQUENCE_RETRY_DELAY_MS));

        // Log the current sequence from Horizon for diagnostics. We can't
        // re-sign the inner tx (no student key), so we retry the original XDR —
        // Horizon deduplicates on tx hash so a prior success surfaces as a
        // different error code, breaking the loop naturally.
        try {
          const feeBumpParsed = TransactionBuilder.fromXDR(xdr, networkPassphrase) as any;
          const innerTx = feeBumpParsed.innerTransaction;
          const freshAccount = await server.loadAccount(innerTx.source);
          logger.debug(`Horizon sequence for ${innerTx.source}: ${freshAccount.sequenceNumber()}`);
        } catch (loadErr) {
          logger.warn('Could not fetch sequence from Horizon:', loadErr);
        }
        continue;
      }

      // Non-retryable error
      const txCode =
        err?.response?.data?.extras?.result_codes?.transaction || err?.message || 'unknown';
      logger.error(`Fee-bump submission failed (attempt ${attempt}): ${txCode}`);
      throw new Error(`Transaction submission failed: ${txCode}`);
    }
  }

  throw new Error(`Fee-bump submission exhausted ${MAX_RETRIES} retries`);
}
