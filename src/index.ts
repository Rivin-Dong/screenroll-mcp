#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ExtensionBridge } from './bridge.js';
import { createMcpServer } from './server.js';
import { WS_PORT } from './types.js';

async function main(): Promise<void> {
  const bridge = new ExtensionBridge();
  bridge.start();

  const server = createMcpServer(bridge);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  /* Graceful shutdown */
  const shutdown = (): void => {
    bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.error(`[ScreenRoll MCP] Server running — WebSocket bridge on 127.0.0.1:${WS_PORT}`);
}

main().catch((err) => {
  console.error('[ScreenRoll MCP] Fatal:', err);
  process.exit(1);
});
