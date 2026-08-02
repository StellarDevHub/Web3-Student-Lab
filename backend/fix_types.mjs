import fs from 'fs';
import path from 'path';

function replaceInFileRegex(filePath, regex, replacement) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(regex, replacement);
    fs.writeFileSync(fullPath, content);
}

const files = [
    'src/licenses/license.routes.ts',
    'src/routes/generator/explorer.routes.ts',
    'src/routes/simulatorErrors.routes.ts',
    'src/simulator/voting.controller.ts',
    'src/infrastructure/p2p.controller.ts',
    'src/dashboard/hash.controller.ts',
];

for (const file of files) {
    replaceInFileRegex(file, /= req\.query/g, '= req.query as Record<string, string>');
    replaceInFileRegex(file, /= req\.params/g, '= req.params as Record<string, string>');
    replaceInFileRegex(file, /= req\.body/g, '= req.body as Record<string, string>');
}

console.log("Replaced req.query and req.params");
