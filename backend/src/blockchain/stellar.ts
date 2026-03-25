import { Horizon, Networks, rpc } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const network = process.env.STELLAR_NETWORK || 'testnet';
const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

export const STELLAR_NETWORK = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

export const horizonServer = new Horizon.Server(horizonUrl);
export const rpcServer = new rpc.Server(rpcUrl);

console.log(`Stellar SDK initialized for ${network} network.`);
console.log(`Horizon URL: ${horizonUrl}`);
console.log(`RPC URL: ${rpcUrl}`);
