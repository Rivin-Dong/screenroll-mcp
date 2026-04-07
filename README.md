# @screenroll/mcp

MCP Server for [ScreenRoll](https://screenroll.dev) — let AI agents control screen recording through the [Model Context Protocol](https://modelcontextprotocol.io).

## Security: pairing token (required)

The WebSocket bridge listens on `127.0.0.1:9877`. **A shared secret is mandatory** so other local processes cannot control recording.

1. Open the **ScreenRoll** extension popup in Chrome → **MCP Pairing**.
2. Click **Generate pairing token & enable bridge** once (one-time). After that, the extension reconnects automatically when Cursor starts this MCP server.
3. Copy the token from the pairing screen into your MCP config (the page shows a ready-to-paste `mcp.json` example), or pass the same value via **`--token`**, **`SCREENROLL_MCP_TOKEN`**, or **`--token-file`**.

## Prerequisites

- **Node.js ≥ 18**
- **ScreenRoll Chrome extension** (with MCP bridge) installed — reload the extension after updating.
- Chrome running while the MCP server is active

## Quick start (Cursor)

Minimal install is still one `npx` command, but you **must** add the token from the extension:

```json
{
  "mcpServers": {
    "screenroll": {
      "command": "npx",
      "args": ["-y", "@screenroll/mcp", "--token", "PASTE_TOKEN_FROM_EXTENSION"]
    }
  }
}
```

Using an environment variable (if your client supports `env`):

```json
{
  "mcpServers": {
    "screenroll": {
      "command": "npx",
      "args": ["-y", "@screenroll/mcp"],
      "env": {
        "SCREENROLL_MCP_TOKEN": "PASTE_TOKEN_FROM_EXTENSION"
      }
    }
  }
}
```

Avoid putting secrets in shared configs when possible — use `--token-file`:

```bash
npx -y @screenroll/mcp --token-file ~/.screenroll-mcp.token
```

If you start the server **without** a token, it **exits immediately** and prints setup instructions.

### Built-in doctor / self-heal

If connection is unstable after restarting your MCP client, run:

```bash
npx -y @screenroll/mcp doctor --fix
```

This checks port `9877`, clears stale ScreenRoll MCP processes, and prints a JSON health report.

### Startup handshake probe (v1.0.3+)

On startup, the MCP server performs an extension handshake probe (5s timeout).
If no extension handshake arrives in time, it prints an actionable hint instead of a generic error:

- Open Chrome extension → MCP Pairing
- If you have not set up MCP yet, click **Generate pairing token & enable bridge** once
- Verify token in MCP config matches the extension token
- Run `npx -y @screenroll/mcp doctor --fix` if needed

### Claude Desktop

Same pattern in `claude_desktop_config.json` under `mcpServers.screenroll`.

### Claude Code

```bash
claude mcp add screenroll -- npx -y @screenroll/mcp --token YOUR_TOKEN
```

## Available tools

| Tool | Description |
|------|-------------|
| `start_recording` | Start recording (tab or desktop). Params: `mode`, `quality`, `includeAudio`, `includeMic` |
| `pause_recording` | Pause the current recording |
| `resume_recording` | Resume a paused recording |
| `stop_recording` | Stop recording and save the file |
| `get_status` | Current state: idle, recording, or paused |
| `list_recordings` | Recent recordings (metadata) |

### Quality presets

| Value | Resolution | Best for |
|-------|-----------|----------|
| `LOW` | 720p | Smallest files |
| `MEDIUM` | 1080p | General use (default) |
| `HIGH` | 1080p | Sharper detail |
| `PRESENTATION` | 1080p | Slides and fine text |
| `ULTRA4K` | 4K | Maximum detail |

## How it works

```
AI Agent ←— MCP (stdio) —→ @screenroll/mcp ←— WebSocket + token —→ ScreenRoll extension
```

- The MCP process listens on **127.0.0.1:9877** for a single authenticated extension connection.
- The extension creates the token when you enable pairing; you copy it into the MCP client config.
- **Regenerate token** in the extension invalidates the old value — update MCP config after regenerating.

## License

MIT
