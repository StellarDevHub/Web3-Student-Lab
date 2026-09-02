import fs from 'fs';

const filePath = 'src/db/index.ts';
let code = fs.readFileSync(filePath, 'utf-8');

const importLines = `
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = \`\${process.env.DATABASE_URL}\`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
`;

code = code.replace(
  "const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });",
  "// temp replace string"
);

code = code.replace(
  "import { Pool } from 'pg';\nimport { PrismaPg } from '@prisma/adapter-pg';\n\nconst connectionString = `${process.env.DATABASE_URL}`;\nconst pool = new Pool({ \n  connectionString,\n  ssl: { rejectUnauthorized: false }\n});\nconst adapter = new PrismaPg(pool);\n",
  ""
);

code = code.replace(
  "// temp replace string",
  `${importLines}\nconst basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });`
);

fs.writeFileSync(filePath, code);
