import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'frontend', 'data', 'contract-registry.json');

export async function GET() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  return new Response(JSON.stringify(json.contracts), { status: 200 });
}

export async function POST(req: Request) {
  const body = await req.json();
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  // expect body to be {contracts: [...]}
  json.contracts = body.contracts ?? json.contracts;
  await writeFile(DATA_PATH, JSON.stringify(json, null, 2), 'utf-8');
  return new Response(JSON.stringify({ok:true}), { status: 200 });
}
