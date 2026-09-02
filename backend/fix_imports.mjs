import fs from 'fs';
import path from 'path';

function replaceInFile(filePath, search, replacement) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.split(search).join(replacement);
    fs.writeFileSync(fullPath, content);
}

replaceInFile('src/dashboard/hash.service.ts', `import prisma from '../db/prisma.js';`, `import prisma from '../db/index.js';`);
replaceInFile('src/infrastructure/p2p.service.ts', `import prisma from '../db/prisma.js';`, `import prisma from '../db/index.js';`);
replaceInFile('src/simulator/voting.service.ts', `import prisma from '../db/prisma.js';`, `import prisma from '../db/index.js';`);
replaceInFile('src/infrastructure/infrastructure.routes.ts', `import { authenticate } from '../middleware/auth.middleware.js';`, `import { authenticate } from '../auth/auth.middleware.js';`);

console.log("Imports fixed");
