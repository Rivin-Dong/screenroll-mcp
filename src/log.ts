let verbose = false;

export function initLogger(argv: string[]): void {
  verbose = argv.includes('--verbose') || process.env.SCREENROLL_MCP_VERBOSE === '1';
}

export function logInfo(message: string): void {
  console.error(`[ScreenRoll MCP][info] ${message}`);
}

export function logWarn(message: string): void {
  console.error(`[ScreenRoll MCP][warn] ${message}`);
}

export function logError(message: string): void {
  console.error(`[ScreenRoll MCP][error] ${message}`);
}

export function logDebug(message: string): void {
  if (!verbose) return;
  console.error(`[ScreenRoll MCP][debug] ${message}`);
}

export function isVerbose(): boolean {
  return verbose;
}
