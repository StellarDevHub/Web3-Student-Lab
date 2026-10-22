"use client";
import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api/v1';

type Delivery = {
  deliveryId: string;
  endpointKey: string;
  destinationUrl: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode?: number;
  lastError?: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  retriggeredFrom?: string;
  retriggeredAs?: string;
};

type EndpointCircuit = {
  endpointKey: string;
  url: string;
  status: 'active' | 'paused' | 'probing';
  consecutiveServerErrors: number;
  resumeAt?: string;
  lastStatusCode?: number;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export default function WebhookDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointCircuit[]>([]);
  const [statusFilter, setStatusFilter] = useState('failed');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const [deliveriesRes, endpointsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/webhooks/deliveries${query}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/admin/webhooks/endpoints`, { headers: authHeaders() }),
      ]);
      if (!deliveriesRes.ok || !endpointsRes.ok) {
        throw new Error(`Request failed (${deliveriesRes.status}/${endpointsRes.status})`);
      }
      const deliveriesBody = await deliveriesRes.json();
      const endpointsBody = await endpointsRes.json();
      setDeliveries(deliveriesBody.data?.deliveries ?? []);
      setEndpoints(endpointsBody.data?.endpoints ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhook deliveries');
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function retrigger(delivery: Delivery) {
    const endpoint = endpoints.find(e => e.endpointKey === delivery.endpointKey);
    const resumeEndpoint = endpoint?.status === 'paused'
      ? confirm('This endpoint is paused by the circuit breaker. Resume it before re-triggering?')
      : false;
    const res = await fetch(`${API_BASE}/admin/webhooks/deliveries/${encodeURIComponent(delivery.deliveryId)}/retrigger`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ resumeEndpoint }),
    });
    const body = await res.json();
    if (!res.ok) alert(body.message ?? 'Failed to re-trigger delivery');
    await load();
  }

  async function retriggerAllFailed() {
    if (!confirm('Re-trigger every failed webhook delivery?')) return;
    const res = await fetch(`${API_BASE}/admin/webhooks/deliveries/retrigger-failed`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    const body = await res.json();
    alert(res.ok ? `Re-triggered ${body.data?.count ?? 0} deliveries` : body.message ?? 'Failed to re-trigger deliveries');
    await load();
  }

  async function resume(endpoint: EndpointCircuit) {
    await fetch(`${API_BASE}/admin/webhooks/endpoints/resume`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint: endpoint.endpointKey }),
    });
    await load();
  }

  return (
    <div style={{padding:20}}>
      <h1>Admin: Webhook Deliveries</h1>
      {error && <p style={{color:'crimson'}}>{error}</p>}

      <h2>Endpoints</h2>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr><th>Endpoint</th><th>Status</th><th>Consecutive 5xx</th><th>Last Status</th><th>Resumes At</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {endpoints.map(e => (
            <tr key={e.endpointKey} style={{borderTop:'1px solid #ddd'}}>
              <td>{e.url}</td>
              <td>{e.status}</td>
              <td>{e.consecutiveServerErrors}</td>
              <td>{e.lastStatusCode ?? '-'}</td>
              <td>{e.resumeAt ? new Date(e.resumeAt).toLocaleString() : '-'}</td>
              <td>{e.status !== 'active' && <button onClick={() => resume(e)}>Resume</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Deliveries</h2>
      <div style={{marginBottom:12}}>
        <label>
          Status{' '}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="failed">Failed</option>
            <option value="retrying">Retrying</option>
            <option value="paused">Paused</option>
            <option value="pending">Pending</option>
            <option value="delivered">Delivered</option>
            <option value="retriggered">Re-triggered</option>
          </select>
        </label>
        <button style={{marginLeft:12}} onClick={retriggerAllFailed}>Re-trigger All Failed</button>
        <button style={{marginLeft:12}} onClick={load}>Refresh</button>
      </div>

      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr><th>Delivery</th><th>Event</th><th>Endpoint</th><th>Status</th><th>Attempts</th><th>Last Error</th><th>Next Retry</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {deliveries.map(d => (
            <tr key={d.deliveryId} style={{borderTop:'1px solid #ddd'}}>
              <td>{d.deliveryId}</td>
              <td>{d.eventType}</td>
              <td>{d.destinationUrl}</td>
              <td>{d.status}{d.retriggeredAs ? ` → ${d.retriggeredAs}` : ''}</td>
              <td>{d.attempts}</td>
              <td>{d.lastStatusCode ? `[${d.lastStatusCode}] ` : ''}{d.lastError ?? '-'}</td>
              <td>{d.nextRetryAt ? new Date(d.nextRetryAt).toLocaleString() : '-'}</td>
              <td>
                {d.status !== 'delivered' && d.status !== 'retriggered' && (
                  <button onClick={() => retrigger(d)}>Re-trigger</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
