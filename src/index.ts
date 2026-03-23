#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ExtensionBridge } from './bridge.js';
import { createMcpServer } from './server.js';
import { acquireInstanceLock, resolveWsPort, runDoctor, selfHealPortIfNeeded } from './runtime.js';
import { exitIfMissingToken } from './token.js';
import { ErrorCode, toScreenRollMcpError } from './errors.js';
import { initLogger, logDebug, logError, logInfo, logWarn } from './log.js';

async function main(): Promise<void> {
  initLogger(process.argv);
  const port = resolveWsPort(process.argv);
  if (process.argv.includes('doctor')) {
    await runDoctorCommand(port, process.argv.includes('--fix'));
    return;
  }

  const pairingToken = exitIfMissingToken();

  logDebug(`starting with port=${port}`);
  await selfHealPortIfNeeded(port);
  const lock = acquireInstanceLock(port);
  const bridge = new ExtensionBridge(pairingToken, port);
  await bridge.start();
  const probe = await bridge.probeHandshake(5000);
  if (!probe.ok) {
    logWarn(`${probe.code}: ${probe.message}`);
  }

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

  logInfo(`Server running — WebSocket bridge on 127.0.0.1:${port}`);
}

async function runDoctorCommand(port: number, fix: boolean): Promise<void> {
  if (fix) {
    logInfo(`doctor --fix: attempting self-heal on port ${port}`);
    await selfHealPortIfNeeded(port);
  }
  const report = runDoctor(port);
  const summary = {
    ok: report.listeningPids.length === 0 || report.listeningPids.some((p) => /screenroll-mcp|@screenroll\/mcp/i.test(p.command)),
    port: report.port,
    listeners: report.listeningPids,
    lock: {
      present: report.hasLock,
      pid: report.lockPid,
      path: report.lockPath,
    },
  };
  // Doctor is intended for terminal output.
  // eslint-disable-next-line no-console
  console.error(`[ScreenRoll MCP][doctor] ${JSON.stringify(summary, null, 2)}`);
}

main().catch((err) => {
  const e = toScreenRollMcpError(err);
  logError(`${e.code}: ${e.message}`);
  if (e.hint) logInfo(`hint: ${e.hint}`);
  if (e.code === ErrorCode.MISSING_TOKEN) {
    // eslint-disable-next-line no-console
    console.error(`
[ScreenRoll MCP] Example Cursor mcp.json entry:
"screenroll": {
  "command": "npx",
  "args": ["-y", "@screenroll/mcp", "--token", "PASTE_TOKEN_HERE"]
}
`);
  }
  process.exit(1);
});
