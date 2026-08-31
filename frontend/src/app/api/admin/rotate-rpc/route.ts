import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'frontend', 'data', 'contract-registry.json');

async function ping(url: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, {method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({jsonrpc:'2.0',id:1,method:'status',params:[]}),cache:'no-store'});
    const ms = Date.now() - start;
    return { url, ok: res.ok, status: res.status, latency: ms };
  } catch (e) {
    return { url, ok: false, latency: null };
  }
}

export async function POST() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  const rpcs = json.rpcs || {};
  const newRpcs: Record<string, string[]> = {};
  for (const [net, list] of Object.entries(rpcs)) {
    const results = await Promise.all((list as string[]).map((u) => ping(u)));
    // sort by latency asc, filter ok
    const ok = results.filter(r => r.ok && r.latency != null).sort((a,b) => a.latency - b.latency).map(r=>r.url);
    const fallback = (list as string[]).filter(u => !ok.includes(u));
    newRpcs[net] = [...ok, ...fallback];
  }
  json.rpcs = newRpcs;
  await writeFile(DATA_PATH, JSON.stringify(json, null, 2), 'utf-8');
  return new Response(JSON.stringify(newRpcs), { status: 200 });
}
