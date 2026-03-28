import { Contract, StrKey, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-test.stellar.org:443';
const CERTIFICATE_CONTRACT_ID = process.env.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID || '';

export interface CertificateData {
  symbol: string;
  student: string;
  course_name: string;
  issue_date: bigint;
}

/**
 * Verify a certificate on the Soroban blockchain
 */
export const verifyCertificateOnChain = async (symbol: string): Promise<CertificateData | null> => {
  try {
    if (!CERTIFICATE_CONTRACT_ID) {
      console.warn('Certificate contract ID not configured');
      return null;
    }

    const server = new rpc.Server(SOROBAN_RPC_URL);

    // Prepare the arguments for 'get_certificate'
    const args = [xdr.ScVal.scvString(symbol)];

    // Simulate the contract call (read-only)
    const simulation = await server.getHealth(); // Check health first
    if (simulation.status !== 'healthy') {
      throw new Error('Soroban RPC is not healthy');
    }

    // Call the contract
    const result = await server.simulateTransaction(
      new Contract(CERTIFICATE_CONTRACT_ID).call('get_certificate', ...args) as any
    );

    if (rpc.Api.isSimulationSuccess(result)) {
      const entry = result.result?.retval;
      if (entry) {
        const data = scValToNative(entry);
        return {
          symbol: data.symbol,
          student: data.student,
          course_name: data.course_name,
          issue_date: data.issue_date,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error verifying certificate on-chain:', error);
    return null;
  }
};

/**
 * Issue a new certificate on the Soroban blockchain
 * This requires a wallet connection and transaction signing
 */
export const issueCertificateOnChain = async (
  symbol: string,
  student: string,
  courseName: string
): Promise<string | null> => {
  try {
    if (!CERTIFICATE_CONTRACT_ID) {
      console.warn('Certificate contract ID not configured');
      return null;
    }

    console.log('Issuing certificate:', { symbol, student, courseName });

    // TODO: Implement actual certificate issuance
    // This requires:
    // 1. Building the contract call transaction
    // 2. Getting it signed by the wallet
    // 3. Submitting to the network
    // 4. Waiting for confirmation

    return 'transaction_hash_placeholder';
  } catch (error) {
    console.error('Error issuing certificate on-chain:', error);
    return null;
  }
};

/**
 * Check if a certificate exists on-chain
 */
export const certificateExistsOnChain = async (symbol: string): Promise<boolean> => {
  try {
    const cert = await verifyCertificateOnChain(symbol);
    return cert !== null;
  } catch {
    return false;
  }
};

/**
 * Convert Stellar address to readable format
 */
export const formatStellarAddress = (address: string): string => {
  try {
    if (StrKey.isValidEd25519PublicKey(address)) {
      return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
    }
    return address;
  } catch {
    return address;
  }
};
