import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  WS_PORT,
  REQUEST_TIMEOUT_MS,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeAction,
} from './types.js';

type PendingEntry = {
  resolve: (resp: BridgeResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * WebSocket bridge that connects the MCP server to the ScreenRoll Chrome extension.
 * Listens on 127.0.0.1 only — not exposed to the network.
 */
export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private extensionId: string | null = null;
  private pending = new Map<string, PendingEntry>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get connectedExtensionId(): string | null {
    return this.extensionId;
  }

  start(): void {
    this.wss = new WebSocketServer({ host: '127.0.0.1', port: WS_PORT });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.wss.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.error(
          `[ScreenRoll MCP] Port ${WS_PORT} is already in use. Is another instance running?`,
        );
        process.exit(1);
      }
      console.error('[ScreenRoll MCP] WebSocket server error:', err.message);
    });
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket?.close();
    this.wss?.close();
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Bridge shutting down'));
    }
    this.pending.clear();
  }

  /** Send a command to the extension and wait for the response. */
  async send(action: BridgeAction, params?: Record<string, unknown>): Promise<BridgeResponse> {
    if (!this.connected) {
      return {
        id: '',
        success: false,
        error:
          'ScreenRoll extension is not connected. Make sure Chrome is running with the ScreenRoll extension installed and active.',
      };
    }

    const id = randomUUID();
    const request: BridgeRequest = { id, action, params };

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          id,
          success: false,
          error: `Extension did not respond within ${REQUEST_TIMEOUT_MS / 1000}s. The extension may be suspended — try opening a Chrome tab.`,
        });
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify(request));
    });
  }

  private handleConnection(ws: WebSocket): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'Replaced by new connection');
    }

    this.socket = ws;
    this.extensionId = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === 'auth' && typeof msg.extensionId === 'string') {
        this.extensionId = msg.extensionId;
        ws.send(JSON.stringify({ type: 'auth_ok' }));
        this.startHeartbeat(ws);
        return;
      }

      const id = msg.id as string;
      const entry = this.pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve(msg as unknown as BridgeResponse);
    });

    ws.on('close', () => {
      if (this.socket === ws) {
        this.socket = null;
        this.extensionId = null;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      }
    });

    ws.on('error', () => {
      ws.close();
    });
  }

  /** Keep the WebSocket alive and prevent MV3 service worker from sleeping. */
  private startHeartbeat(ws: WebSocket): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 20_000);
  }
}
