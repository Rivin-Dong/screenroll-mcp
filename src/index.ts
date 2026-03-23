#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ExtensionBridge } from './bridge.js';
import { createMcpServer } from './server.js';
import { acquireInstanceLock, resolveWsPort, selfHealPortIfNeeded } from './runtime.js';
import { exitIfMissingToken } from './token.js';

async function main(): Promise<void> {
  const pairingToken = exitIfMissingToken();
  const port = resolveWsPort(process.argv);

  await selfHealPortIfNeeded(port);
  const lock = acquireInstanceLock(port);
  const bridge = new ExtensionBridge(pairingToken, port);
  await bridge.start();

  const server = createMcpServer(bridge);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  /* Graceful shutdown */
  const shutdown = (): void => {
    bridge.stop();
    lock.release();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => lock.release());

  console.error(`[ScreenRoll MCP] Server running — WebSocket bridge on 127.0.0.1:${port}`);
}

main().catch((err) => {
  console.error('[ScreenRoll MCP] Fatal:', err);
  process.exit(1);
});
