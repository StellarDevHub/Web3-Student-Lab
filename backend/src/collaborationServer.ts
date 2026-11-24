import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { YjsDocumentManager } from './services/yjsDocumentManager.js';

const port = process.env.WS_PORT || 1234;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10);
const MAX_PAYLOAD_BYTES = parseInt(process.env.WS_MAX_PAYLOAD_BYTES || String(10 * 1024 * 1024), 10);
const ROOM_NAME_PATTERN = /^[\w\-.:/]{1,200}$/;

const documents = new YjsDocumentManager();
const liveConnections = new WeakSet<WebSocket>();

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    const { rooms, connections } = documents.stats();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'ok',
        activeRooms: rooms,
        connections,
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      })
    );
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Y-Websocket Collaboration Server is running');
});

// perMessageDeflate is disabled: Yjs updates are already compact binary and
// per-socket zlib contexts dominate memory at thousands of connections.
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: MAX_PAYLOAD_BYTES });

wss.on('connection', (conn: WebSocket, req) => {
  const url = new URL(req?.url || '/', `http://${req?.headers.host || 'localhost'}`);
  let roomName = '';
  try {
    roomName = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'default';
  } catch {
    // fall through to the invalid-name rejection below
  }

  if (!ROOM_NAME_PATTERN.test(roomName)) {
    conn.close(1008, 'invalid room name');
    return;
  }

  liveConnections.add(conn);
  conn.on('pong', () => liveConnections.add(conn));

  void documents.setupConnection(conn, roomName);
});

// Terminate sockets that stopped answering pings so their rooms get released.
const heartbeat = setInterval(() => {
  wss.clients.forEach((conn) => {
    if (!liveConnections.has(conn)) {
      conn.terminate();
      return;
    }
    liveConnections.delete(conn);
    conn.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

documents.startSnapshotting();

const shutdown = async (signal: string) => {
  console.log(`Collaboration server received ${signal}, flushing documents...`);
  clearInterval(heartbeat);
  wss.clients.forEach((conn) => conn.close(1001, 'server shutting down'));
  server.close();
  await documents.shutdown();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

server.listen(port, () => {
  console.log(`Collaboration server running on port ${port}`);
});
