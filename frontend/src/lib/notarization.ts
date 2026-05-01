import { rpc, scValToNative, xdr, Contract, Address } from "@stellar/stellar-sdk";

const SOROBAN_RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID || "";

export interface TimestampedProof {
  timestamp: bigint;
  ledger_seq: number;
}

export interface NotarizationRecord {
  hash: string;
  owner: string;
  proof: TimestampedProof;
  metadata: string;
}

/**
 * Calculates the SHA-256 hash of a file.
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Notarizes a file hash on-chain.
 * Note: This function currently only simulates or provides the logic for building the tx.
 * Actual signing should be handled by a wallet provider.
 */
export async function notarizeFileOnChain(
  hash: string,
  owner: string,
  metadata: string
): Promise<string> {
  if (!CONTRACT_ID) throw new Error("Contract ID not configured");

  console.log("Notarizing file:", { hash, owner, metadata });
  
  // In a real application, this would use a wallet (like Freighter) to sign.
  // Here we'll return a mock transaction hash for the UI to show progress.
  return "notarization_tx_" + Math.random().toString(36).substring(2, 15);
}

/**
 * Verifies a file hash against the blockchain.
 */
export async function verifyFileOnChain(hash: string): Promise<NotarizationRecord | null> {
  if (!CONTRACT_ID) return null;

  try {
    const server = new rpc.Server(SOROBAN_RPC_URL);
    const contract = new Contract(CONTRACT_ID);
    
    // Build the ScVal for the hash (BytesN<32>)
    const hashBytes = Buffer.from(hash, "hex");
    const hashScVal = xdr.ScVal.scvBytes(hashBytes);
    
    // Prepare the simulation
    const tx = new rpc.Server(SOROBAN_RPC_URL);
    // This is a simplified call logic for demonstration
    // In a real app, we use server.simulateTransaction
    
    console.log("Verifying hash on-chain:", hash);
    
    // Mock response if contract call fails or for demonstration
    // If you want actual on-chain data, you'd need a deployed contract and valid RPC
    return null;
  } catch (error) {
    console.error("Error verifying file on-chain:", error);
    return null;
  }
}

/**
 * Fetches notarization history for an address.
 */
export async function getNotarizationHistory(owner: string): Promise<NotarizationRecord[]> {
  console.log("Fetching history for:", owner);
  // Returns mock data for now to demonstrate UI
  return [
    {
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      owner: owner,
      proof: { timestamp: BigInt(Math.floor(Date.now() / 1000) - 86400), ledger_seq: 12345 },
      metadata: "Genesis Empty File"
    }
  ];
}
