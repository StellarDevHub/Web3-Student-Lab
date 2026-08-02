import * as dotenv from 'dotenv';
dotenv.config();
import { getProfileStatusByWallet } from './src/auth/auth.service.js';

async function main() {
  try {
    const res = await getProfileStatusByWallet("0x1234567890123456789012345678901234567890");
    console.log("Success:", res);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
main();
