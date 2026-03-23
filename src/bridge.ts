import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
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
 * Requires a shared pairing token (extension shows it; user passes it to this process).
 */
export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private extensionId: string | null = null;
  private pending = new Map<string, PendingEntry>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastDisconnectedHint:
    | {
        code: string;
        message: string;
      }
    | null = null;

  constructor(
    private readonly expectedToken: string,
    private readonly port: number = WS_PORT,
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get connectedExtensionId(): string | null {
    return this.extensionId;
  }

  async probeHandshake(timeoutMs = 5000): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
  }> {
    if (this.connected) return { ok: true };
    const started = Date.now();
    const intervalMs = 125;
    while (Date.now() - started < timeoutMs) {
      if (this.connected) return { ok: true };
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const diagnostic = {
      ok: false,
      code: 'E_HANDSHAKE_TIMEOUT',
      message:
        'Extension handshake timed out. Open ScreenRoll extension > MCP Pairing, click Copy once to activate bridge, verify token in mcp.json, then retry. If needed run: npx -y @screenroll/mcp doctor --fix',
    };
    this.lastDisconnectedHint = {
      code: diagnostic.code,
      message: diagnostic.message,
    };
    return diagnostic;
  }

  private tokensEqual(received: string): boolean {
    const a = Buffer.from(received, 'utf8');
    const b = Buffer.from(this.expectedToken, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async start(): Promise<void> {
    if (this.wss) return;
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port: this.port });
      this.wss = wss;
      let settled = false;

      const fail = (err: Error): void => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        console.error('[ScreenRoll MCP] WebSocket server error:', err.message);
      };

      wss.on('connection', (ws) => this.handleConnection(ws));
      wss.once('listening', () => {
        settled = true;
        resolve();
      });
      wss.on('error', (err) => fail(err as Error));
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
      const hinted = this.lastDisconnectedHint
        ? ` ${this.lastDisconnectedHint.code}: ${this.lastDisconnectedHint.message}`
        : '';
      return {
        id: '',
        success: false,
        error:
          'ScreenRoll extension is not connected. Open Chrome with ScreenRoll installed and ensure MCP pairing is active.' +
          hinted,
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
    let authenticated = false;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        if (!authenticated) ws.close(4000, 'invalid json');
        return;
      }

      if (!authenticated) {
        if (
          msg.type === 'auth' &&
          typeof msg.extensionId === 'string' &&
          typeof msg.token === 'string'
        ) {
          if (this.tokensEqual(msg.token)) {
            authenticated = true;
            if (this.socket && this.socket !== ws && this.socket.readyState === WebSocket.OPEN) {
              this.socket.close(1000, 'Replaced by new connection');
            }
            this.socket = ws;
            this.extensionId = msg.extensionId;
            this.lastDisconnectedHint = null;
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            this.startHeartbeat(ws);
          } else {
            try {
              ws.send(JSON.stringify({ type: 'auth_error', error: 'invalid_token' }));
            } catch {
              /* ignore */
            }
            ws.close(4001, 'invalid token');
          }
        } else {
          try {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'auth_required' }));
          } catch {
            /* ignore */
          }
          ws.close(4002, 'auth required');
        }
        return;
      }

      if (ws !== this.socket) return;

      const id = msg.id as string;
      const entry = id ? this.pending.get(id) : undefined;
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
        this.heartbeatTimer = null;
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
