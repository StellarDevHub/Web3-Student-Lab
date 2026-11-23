import crypto from 'crypto';

export async function sha256Hex(buffer: ArrayBuffer | Uint8Array) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
  const hash = crypto.createHash('sha256').update(u8).digest('hex');
  return hash;
}

export async function fetchWasmFromRpc(rpcUrl: string, contractAddress: string): Promise<Uint8Array | null> {
  try {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'get_contract',
      params: [contractAddress]
    };
    const res = await fetch(rpcUrl, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    if (!res.ok) return null;
    const data = await res.json();
    // Expect data.result.wasm_base64 or similar. Try common shapes.
    const wasmBase64 = data?.result?.wasm || data?.result?.wasm_base64 || data?.wasm;
    if (!wasmBase64) return null;
    const bin = Buffer.from(wasmBase64, 'base64');
    return new Uint8Array(bin);
  } catch (e) {
    return null;
  }
}
