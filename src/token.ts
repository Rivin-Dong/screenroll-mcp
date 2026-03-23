import { readFileSync } from 'node:fs';
import { ErrorCode, ScreenRollMcpError } from './errors.js';

/**
 * Resolve pairing token from env, --token, or --token-file (in that order).
 */
export function resolvePairingToken(): string {
  const env = process.env.SCREENROLL_MCP_TOKEN?.trim();
  if (env) return env;

  const argv = process.argv;
  const fileIdx = argv.indexOf('--token-file');
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    try {
      return readFileSync(argv[fileIdx + 1], 'utf8').trim();
    } catch (e) {
      console.error('[ScreenRoll MCP] Cannot read --token-file:', (e as Error).message);
      process.exit(1);
    }
  }

  const tokIdx = argv.indexOf('--token');
  if (tokIdx !== -1 && argv[tokIdx + 1]) {
    return argv[tokIdx + 1].trim();
  }

  return '';
}

export function exitIfMissingToken(): string {
  const token = resolvePairingToken();
  if (token) return token;
  throw new ScreenRollMcpError(
    ErrorCode.MISSING_TOKEN,
    'Missing pairing token (required for security).',
    'Open ScreenRoll extension → MCP Pairing → Copy token, then set --token in your MCP config.',
  );
}
