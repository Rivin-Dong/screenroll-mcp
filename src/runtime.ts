import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WS_PORT } from './types.js';
import { ErrorCode, ScreenRollMcpError } from './errors.js';

type LockHandle = {
  release: () => void;
};

export function resolveWsPort(argv: string[]): number {
  const idx = argv.indexOf('--ws-port');
  if (idx !== -1 && argv[idx + 1]) {
    const parsed = Number(argv[idx + 1]);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
    throw new ScreenRollMcpError(
      ErrorCode.INVALID_WS_PORT,
      'Invalid --ws-port value. Expected 1-65535.',
      'Use --ws-port <1-65535> or remove the flag to use the default 9877.',
    );
  }
  return WS_PORT;
}

function listListeningPids(port: number): number[] {
  const out = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  });
  if (out.status !== 0 || !out.stdout.trim()) return [];
  return out.stdout
    .split('\n')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function getCommand(pid: number): string {
  const out = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (out.status !== 0) return '';
  return out.stdout.trim();
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitExit(pid: number, timeoutMs: number): Promise<boolean> {
  const step = 150;
  const rounds = Math.ceil(timeoutMs / step);
  for (let i = 0; i < rounds; i++) {
    if (!isAlive(pid)) return true;
    await sleep(step);
  }
  return !isAlive(pid);
}

export async function selfHealPortIfNeeded(port: number): Promise<void> {
  const pids = listListeningPids(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) return;

  for (const pid of pids) {
    const cmd = getCommand(pid);
    const isScreenRoll = /screenroll-mcp|@screenroll\/mcp/i.test(cmd);
    if (!isScreenRoll) {
      throw new ScreenRollMcpError(
        ErrorCode.PORT_IN_USE_FOREIGN,
        `Port ${port} is already used by another app (pid ${pid}). Command: ${cmd || 'unknown'}`,
        'Stop that process or run ScreenRoll MCP with --ws-port <port>.',
      );
    }

    console.error(`[ScreenRoll MCP] Found stale ScreenRoll MCP process (pid ${pid}). Cleaning up...`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    const exited = await waitExit(pid, 1600);
    if (!exited) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
      await waitExit(pid, 800);
    }
  }

  const stillUsed = listListeningPids(port).filter((pid) => pid !== process.pid);
  if (stillUsed.length > 0) {
    throw new ScreenRollMcpError(
      ErrorCode.PORT_STILL_IN_USE,
      `Port ${port} is still in use after cleanup attempt (pid ${stillUsed.join(', ')}).`,
      'Retry after 2-3 seconds or choose another port with --ws-port.',
    );
  }
}

export function acquireInstanceLock(port: number): LockHandle {
  const lockPath = join(tmpdir(), `screenroll-mcp-${port}.lock`);
  if (existsSync(lockPath)) {
    const text = readFileSync(lockPath, 'utf8').trim();
    const prevPid = Number(text);
    if (Number.isInteger(prevPid) && prevPid > 0 && isAlive(prevPid)) {
      const cmd = getCommand(prevPid);
      if (/screenroll-mcp|@screenroll\/mcp/i.test(cmd)) {
        throw new ScreenRollMcpError(
          ErrorCode.INSTANCE_ALREADY_RUNNING,
          `Another ScreenRoll MCP instance is active (pid ${prevPid}) on port ${port}.`,
          'Close the existing client session or kill the stale process.',
        );
      }
    }
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }

  writeFileSync(lockPath, String(process.pid), 'utf8');
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      try {
        if (existsSync(lockPath)) unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    },
  };
}

export type DoctorReport = {
  port: number;
  listeningPids: Array<{ pid: number; command: string }>;
  hasLock: boolean;
  lockPid: number | null;
  lockPath: string;
};

export function runDoctor(port: number): DoctorReport {
  const pids = listListeningPids(port);
  const listeningPids = pids.map((pid) => ({ pid, command: getCommand(pid) || 'unknown' }));
  const lockPath = join(tmpdir(), `screenroll-mcp-${port}.lock`);
  const hasLock = existsSync(lockPath);
  let lockPid: number | null = null;
  if (hasLock) {
    const text = readFileSync(lockPath, 'utf8').trim();
    const n = Number(text);
    if (Number.isInteger(n) && n > 0) lockPid = n;
  }
  return { port, listeningPids, hasLock, lockPid, lockPath };
}
