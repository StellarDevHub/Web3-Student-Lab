import fs from 'fs';

const filePath = 'src/contexts/WalletContext.tsx';
let code = fs.readFileSync(filePath, 'utf-8');

const newConnect = `
  connect: async () => {
    let access;
    try {
      access = await requestFreighterAccess();
    } catch (e) {
      throw new Error('Failed to request access from Freighter. Make sure the extension is unlocked and enabled for this site.');
    }
    
    if (!access || access.error || !access.address) {
      throw new Error(access?.error || 'Freighter did not return an address. Please unlock your wallet and try again.');
    }

    return access.address;
  },
`;

code = code.replace(
  /connect:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?(?=\s*disconnect:\s*async\s*\(\)\s*=>\s*\{\},)/,
  newConnect.trim() + '\n'
);

fs.writeFileSync(filePath, code);
