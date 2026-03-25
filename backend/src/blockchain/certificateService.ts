import { Contract, xdr, scValToNative, rpc, TransactionBuilder, Account, Networks } from '@stellar/stellar-sdk';
import { rpcServer, STELLAR_NETWORK } from './stellar.js';

export interface Certificate {
  symbol: string;
  student: string;
  course_name: string;
  issue_date: number;
}

const CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || '';

/**
 * Fetch certificate data from the Soroban contract by its symbol.
 * @param symbol The symbol of the certificate to retrieve.
 * @returns The certificate data if found, or null.
 */
export async function getCertificate(symbol: string): Promise<Certificate | null> {
  if (!CONTRACT_ID) {
    console.error('SOROBAN_CONTRACT_ID is not defined in environment variables.');
    return null;
  }

  try {
    const contract = new Contract(CONTRACT_ID);
    
    // Prepare the argument (symbol)
    const arg = xdr.ScVal.scvSymbol(symbol);
    
    // To simulate a transaction, we need a dummy transaction
    // Using a random public key for simulation
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: STELLAR_NETWORK === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET
    })
      .addOperation(contract.call('get_certificate', arg))
      .setTimeout(0)
      .build();

    const response = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(response)) {
      const result = response.result?.retval;
      if (result) {
        return scValToNative(result) as Certificate;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching certificate ${symbol}:`, error);
    return null;
  }
}

/**
 * Verify a certificate by checking if on-chain data matches the student name.
 * @param symbol The certificate symbol.
 * @param studentName The name to verify.
 * @returns True if the certificate is valid and matches the student name.
 */
export async function verifyCertificate(symbol: string, studentName: string): Promise<boolean> {
  const certificate = await getCertificate(symbol);
  
  if (!certificate) {
    return false;
  }

  // Check if student names match (case-insensitive)
  return certificate.student.toLowerCase() === studentName.toLowerCase();
}
