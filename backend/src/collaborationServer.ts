import http from 'http';
import { WebSocketServer } from 'ws';
// @ts-expect-error: y-websocket does not provide type declarations for its bin utils
import { setupWSConnection } from 'y-websocket/bin/utils';

const port = process.env.WS_PORT || 1234;
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Y-Websocket Server is running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req);
});

server.listen(port, () => {
  console.log(`Collaboration server running on port ${port}`);
});
