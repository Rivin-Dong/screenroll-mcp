# screenroll-mcp

MCP Server for [ScreenRoll](https://screenroll.app) — let AI agents control screen recording through the [Model Context Protocol](https://modelcontextprotocol.io).

## What it does

ScreenRoll MCP gives any MCP-compatible AI agent (Cursor, Claude Desktop, Claude Code, OpenClaw, etc.) the ability to **start, pause, resume, and stop** screen recordings via the ScreenRoll Chrome extension — no GUI interaction needed.

## Prerequisites

- **Node.js ≥ 18**
- **ScreenRoll Chrome extension** installed and active in Chrome
- Chrome must be running while the MCP server is active

## Quick Start

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "screenroll": {
      "command": "npx",
      "args": ["-y", "screenroll-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "screenroll": {
      "command": "npx",
      "args": ["-y", "screenroll-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add screenroll -- npx -y screenroll-mcp
```

## Available Tools

| Tool | Description |
|------|-------------|
| `start_recording` | Start recording (tab or desktop). Params: `mode`, `quality`, `includeAudio`, `includeMic` |
| `pause_recording` | Pause the current recording |
| `resume_recording` | Resume a paused recording |
| `stop_recording` | Stop recording and save the file |
| `get_status` | Get current state: idle, recording, or paused |
| `list_recordings` | List recent recordings with metadata |

### Quality Presets

| Value | Resolution | Best for |
|-------|-----------|----------|
| `LOW` | 720p | Smallest files |
| `MEDIUM` | 1080p | General use (default) |
| `HIGH` | 1080p | Sharper detail |
| `PRESENTATION` | 1080p | Slides and fine text |
| `ULTRA4K` | 4K | Maximum detail |

## How it works

```
AI Agent ←— MCP (stdio) —→ screenroll-mcp ←— WebSocket —→ ScreenRoll Extension
```

The MCP server starts a local WebSocket server on `127.0.0.1:9877`. The ScreenRoll Chrome extension connects to it automatically. Commands from the AI agent are translated into Chrome extension messages and executed.

All communication stays on localhost — nothing leaves your machine.

## Example Usage

An agent can say:

> "Record my screen while I demo this feature, then stop when I'm done."

The agent will call:
1. `start_recording` with `mode: "desktop"` and `quality: "HIGH"`
2. *(user does the demo)*
3. `stop_recording`

The recording is saved to `Downloads/ScreenRoll/`.

## License

MIT
