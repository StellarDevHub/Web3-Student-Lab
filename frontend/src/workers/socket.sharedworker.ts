/// <reference lib="webworker" />

/**
 * The only place a native WebSocket is created for application event streams.
 * A SharedWorker is shared by every same-origin tab, so ports are multiplexed
 * onto one socket. BroadcastChannel additionally mirrors events to another
 * worker instance if a browser isolates workers during a process restart.
 */
export {};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
type WorkerCommand =
  | { type: 'connect'; url: string; token?: string | null }
  | { type: 'disconnect' }
  | { type: 'send'; messageType: string; data: unknown }
  | { type: 'subscribe'; channel: string; payload?: Record<string, unknown> }
  | { type: 'unsubscribe'; channel: string };
type WorkerEvent =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'message'; message: { type: string; data: unknown; timestamp: string } }
  | { type: 'error'; message: string };

const EVENT_CHANNEL = 'web3-student-lab.socket-events';
const ports = new Set<MessagePort>();
const subscriptions = new Map<string, Set<MessagePort>>();
const channel = new BroadcastChannel(EVENT_CHANNEL);
let socket: WebSocket | null = null;
let socketUrl: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manuallyDisconnected = false;
let status: ConnectionStatus = 'disconnected';

const post = (port: MessagePort, event: WorkerEvent) => port.postMessage(event);
const broadcast = (event: WorkerEvent) => ports.forEach((port) => post(port, event));
function setStatus(next: ConnectionStatus) { if (status !== next) { status = next; broadcast({ type: 'status', status }); } }
function endpoint(url: string, token?: string | null) { if (!token) return url; const parsed = new URL(url); if (!parsed.searchParams.has('token')) parsed.searchParams.set('token', token); return parsed.toString(); }
function sendRaw(payload: unknown) { if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(payload)); return true; } return false; }
function restoreSubscriptions() { subscriptions.forEach((_ports, subscription) => sendRaw({ type: 'subscribe', channel: subscription })); }
function scheduleReconnect() { if (manuallyDisconnected || !socketUrl || ports.size === 0) return; const delay = Math.min(1_000 * 2 ** reconnectAttempts, 30_000); reconnectAttempts += 1; setStatus('reconnecting'); reconnectTimer = setTimeout(connect, delay); }
function connect() {
  if (!socketUrl || ports.size === 0 || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  manuallyDisconnected = false; setStatus(reconnectAttempts ? 'reconnecting' : 'connecting');
  try { socket = new WebSocket(socketUrl); } catch (error) { broadcast({ type: 'error', message: error instanceof Error ? error.message : 'Unable to open WebSocket' }); scheduleReconnect(); return; }
  socket.onopen = () => { reconnectAttempts = 0; setStatus('connected'); restoreSubscriptions(); };
  socket.onmessage = (event) => publishIncoming(event.data);
  socket.onerror = () => broadcast({ type: 'error', message: 'WebSocket connection error' });
  socket.onclose = () => { socket = null; setStatus('disconnected'); scheduleReconnect(); };
}
function publishIncoming(raw: unknown) {
  let parsed: unknown = raw;
  if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { /* deliver raw messages */ } }
  const value = parsed as { type?: unknown; data?: unknown };
  const event: WorkerEvent = { type: 'message', message: { type: typeof value?.type === 'string' ? value.type : 'message', data: value && typeof value === 'object' && 'data' in value ? value.data : parsed, timestamp: new Date().toISOString() } };
  broadcast(event); channel.postMessage(event);
}
channel.onmessage = (event: MessageEvent<WorkerEvent>) => broadcast(event.data);
function removePort(port: MessagePort) {
  ports.delete(port);
  subscriptions.forEach((subscribers, subscription) => { subscribers.delete(port); if (subscribers.size === 0) { subscriptions.delete(subscription); sendRaw({ type: 'unsubscribe', channel: subscription }); } });
  if (ports.size === 0) { manuallyDisconnected = true; if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = null; socket?.close(1000, 'No active tabs'); socket = null; setStatus('disconnected'); }
}
function handleCommand(port: MessagePort, command: WorkerCommand) {
  switch (command.type) {
    case 'connect': ports.add(port); socketUrl = endpoint(command.url, command.token); manuallyDisconnected = false; post(port, { type: 'status', status }); connect(); break;
    case 'disconnect': removePort(port); break;
    case 'send': sendRaw({ type: command.messageType, data: command.data }); break;
    case 'subscribe': { const subscribers = subscriptions.get(command.channel) ?? new Set<MessagePort>(); const first = subscribers.size === 0; subscribers.add(port); subscriptions.set(command.channel, subscribers); if (first) sendRaw({ type: 'subscribe', channel: command.channel, payload: command.payload }); break; }
    case 'unsubscribe': { const subscribers = subscriptions.get(command.channel); if (!subscribers) break; subscribers.delete(port); if (subscribers.size === 0) { subscriptions.delete(command.channel); sendRaw({ type: 'unsubscribe', channel: command.channel }); } break; }
  }
}
self.onconnect = (event: MessageEvent) => { const port = event.ports[0]; ports.add(port); port.onmessage = (message: MessageEvent<WorkerCommand>) => handleCommand(port, message.data); port.start(); post(port, { type: 'status', status }); };
