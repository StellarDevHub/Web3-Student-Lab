import { getCertificate, verifyCertificate } from '../src/blockchain/certificateService.js';
import dotenv from 'dotenv';
dotenv.config();
async function testBlockchainService() {
    console.log('Testing Blockchain Service...');
    const symbol = 'SOLID'; // Match the symbol from the contract test
    const studentName = 'Ada Lovelace';
    console.log(`Querying certificate with symbol: ${symbol}`);
    try {
        const certificate = await getCertificate(symbol);
        if (certificate) {
            console.log('Certificate found:', certificate);
            const isValid = await verifyCertificate(symbol, studentName);
            console.log(`Verification for ${studentName}: ${isValid ? 'PASSED' : 'FAILED'}`);
        }
        else {
            console.log('Certificate not found on-chain. This is expected if SOROBAN_CONTRACT_ID is not set or the certificate does not exist.');
        }
    }
    catch (error) {
        console.error('Test failed with error:', error);
    }
}
testBlockchainService();
//# sourceMappingURL=blockchain_test.js.map