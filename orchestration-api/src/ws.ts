import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import type { RobotState } from './telemetry.js';

export const FLEET_SOCKET_PATH = '/ws/fleet';

/**
 * Accepts dashboard sockets on /ws/fleet. Browsers cannot set headers on a
 * WebSocket, so the JWT travels in the `token` query parameter.
 * Returns a broadcast function that fans a batch out to every client.
 */
export function attachFleetSocket(server: Server, secret: string): (states: RobotState[]) => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== FLEET_SOCKET_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    try {
      verifyToken(url.searchParams.get('token') ?? '', secret);
    } catch {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  return (states) => {
    if (states.length === 0 || wss.clients.size === 0) return;
    const frame = JSON.stringify(states);
    for (const client of wss.clients) {
      // Skip clients that cannot keep up instead of queueing unbounded memory.
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 1_000_000) client.send(frame);
    }
  };
}
