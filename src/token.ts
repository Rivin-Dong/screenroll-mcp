import { readFileSync } from 'node:fs';

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

  console.error(`
[ScreenRoll MCP] Missing pairing token (required for security).

1. Open the ScreenRoll extension popup in Chrome.
2. Find "MCP pairing" and copy the token.
3. Add it to your MCP config, for example Cursor ~/.cursor/mcp.json:

   "screenroll": {
     "command": "npx",
     "args": ["-y", "@screenroll/mcp", "--token", "PASTE_TOKEN_HERE"]
   }

   Or use an environment variable (if your client supports it):

   "env": { "SCREENROLL_MCP_TOKEN": "PASTE_TOKEN_HERE" }

Optional: pass a file path instead of embedding the secret:

   --token-file /path/to/screenroll-mcp.token
`);
  process.exit(1);
}
