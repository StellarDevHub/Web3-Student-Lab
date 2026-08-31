"use client";
import { useEffect, useState } from "react";

type Network = "testnet" | "futurenet" | "mainnet";

type ContractEntry = {
  id: string;
  network: Network;
  address: string;
  expectedHash?: string;
};

export default function AdminPage() {
  const [registry, setRegistry] = useState<ContractEntry[]>([]);
  const [rpcStatus, setRpcStatus] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin/registry')
      .then(r => r.json())
      .then(setRegistry)
      .catch(() => setRegistry([]));

    fetch('/api/admin/rpc-health')
      .then(r => r.json())
      .then(setRpcStatus)
      .catch(() => setRpcStatus(null));
  }, []);

  async function verify(entry: ContractEntry) {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify(entry)
    });
    const body = await res.json();
    alert(JSON.stringify(body));
  }

  async function rotateRpc() {
    const res = await fetch('/api/admin/rotate-rpc', {method: 'POST'});
    const body = await res.json();
    setRpcStatus(body);
    alert('RPC rotation applied');
  }

  return (
    <div style={{padding:20}}>
      <h1>Admin: Soroban Network Registry</h1>
      <button onClick={rotateRpc}>Rotate RPC</button>
      <h2>RPC Status</h2>
      <pre>{rpcStatus ? JSON.stringify(rpcStatus, null, 2) : 'Loading...'}</pre>
      <h2>Contracts</h2>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th>ID</th><th>Network</th><th>Address</th><th>Expected Hash</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {registry.map((e) => (
            <tr key={e.id} style={{borderTop:'1px solid #ddd'}}>
              <td>{e.id}</td>
              <td>{e.network}</td>
              <td>{e.address}</td>
              <td>{e.expectedHash ?? '-'}</td>
              <td>
                <button onClick={() => verify(e)}>Verify Bytecode</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
