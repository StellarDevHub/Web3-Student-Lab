import http from 'http';
import { WebSocketServer } from 'ws';
import { WebsocketProvider } from 'y-websocket';

const port = process.env.WS_PORT || 1234;
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Y-Websocket Server is running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
  const url = new URL(req?.url || '/', `http://${req?.headers.host || 'localhost'}`);
  const roomName = url.pathname.replace(/^\//, '') || 'default';
  const provider = new WebsocketProvider(`ws://${req?.headers.host || `localhost:${port}`}`, roomName, undefined as any, {
    WebSocketPolyfill: WebSocket,
  });
  provider.connect();
});

server.listen(port, () => {
  console.log(`Collaboration server running on port ${port}`);
});
