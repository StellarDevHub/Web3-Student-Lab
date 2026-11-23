import { readFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'frontend', 'data', 'contract-registry.json');

async function ping(url: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, {method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({jsonrpc:'2.0',id:1,method:'status',params:[]}),cache:'no-store',timeout:10000});
    const ms = Date.now() - start;
    return { url, ok: res.ok, status: res.status, latency: ms };
  } catch (e) {
    return { url, ok: false, latency: null };
  }
}

export async function GET() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  const rpcs = json.rpcs || {};
  const results: Record<string, any[]> = {};
  for (const [net, list] of Object.entries(rpcs)) {
    results[net] = await Promise.all((list as string[]).map((u) => ping(u)));
  }
  return new Response(JSON.stringify(results), { status: 200 });
}
