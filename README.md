# @screenroll/mcp

MCP Server for [ScreenRoll](https://screenroll.app) — let AI agents control screen recording through the [Model Context Protocol](https://modelcontextprotocol.io).

## Security: pairing token (required)

The WebSocket bridge listens on `127.0.0.1:9877`. **A shared secret is mandatory** so other local processes cannot control recording.

1. Open the **ScreenRoll** extension popup in Chrome.
2. Under **MCP pairing**, copy the token (or use the example JSON shown there).
3. Pass the same value to this package via **`--token`**, **`SCREENROLL_MCP_TOKEN`**, or **`--token-file`**.

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
- The extension generates and stores a token; you copy it into the MCP client config.
- **Regenerate token** in the extension invalidates the old value — update MCP config after regenerating.

## License

MIT
