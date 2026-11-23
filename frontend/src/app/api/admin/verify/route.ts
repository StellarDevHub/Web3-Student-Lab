import { fetchWasmFromRpc, sha256Hex } from '@/lib/wasmVerify';
import { readFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'frontend', 'data', 'contract-registry.json');

export async function POST(req: Request) {
  const body = await req.json();
  const { network, address, expectedHash } = body;
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  const rpcs: string[] = (json.rpcs && json.rpcs[network]) || [];
  // attempt each rpc until we fetch wasm
  for (const rpc of rpcs) {
    const wasm = await fetchWasmFromRpc(rpc, address);
    if (wasm) {
      const hash = await sha256Hex(wasm);
      const match = expectedHash ? hash === expectedHash : true;
      return new Response(JSON.stringify({ok:true, rpc, hash, match}), { status: 200 });
    }
  }
  return new Response(JSON.stringify({ok:false, error:'could not fetch wasm from any RPC'}), { status: 500 });
}
