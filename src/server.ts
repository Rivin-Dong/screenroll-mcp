import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExtensionBridge } from './bridge.js';

export function createMcpServer(bridge: ExtensionBridge): McpServer {
  const server = new McpServer({
    name: 'screenroll-mcp',
    version: '1.0.3',
  });

  /* ------------------------------------------------------------------ */
  /*  start_recording                                                    */
  /* ------------------------------------------------------------------ */
  server.tool(
    'start_recording',
    'Start a new screen recording via the ScreenRoll Chrome extension. ' +
      'Use mode "tab" to capture the current browser tab, or "desktop" to let the user pick a screen/window.',
    {
      mode: z
        .enum(['tab', 'desktop'])
        .default('tab')
        .describe('Capture source: current Chrome tab or full screen / window picker'),
      quality: z
        .enum(['LOW', 'MEDIUM', 'HIGH', 'PRESENTATION', 'ULTRA4K'])
        .default('MEDIUM')
        .describe(
          'Video quality preset. LOW=720p, MEDIUM=1080p balanced, HIGH=1080p sharp, PRESENTATION=1080p for slides, ULTRA4K=4K',
        ),
      includeAudio: z
        .boolean()
        .default(true)
        .describe('Capture system / tab audio'),
      includeMic: z
        .boolean()
        .default(false)
        .describe('Mix in microphone audio'),
    },
    async ({ mode, quality, includeAudio, includeMic }) => {
      const resp = await bridge.send('start_recording', {
        captureMode: mode,
        quality,
        includeTabAudio: includeAudio,
        includeMic,
      });

      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to start recording: ${resp.error}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'recording',
                mode,
                quality,
                audio: includeAudio,
                mic: includeMic,
                message: mode === 'desktop'
                  ? 'Recording started. The user may need to select a screen/window in the system dialog.'
                  : 'Recording the current browser tab.',
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /* ------------------------------------------------------------------ */
  /*  pause_recording                                                    */
  /* ------------------------------------------------------------------ */
  server.tool(
    'pause_recording',
    'Pause the current ScreenRoll recording. Can be resumed later.',
    {},
    async () => {
      const resp = await bridge.send('pause_recording');
      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to pause: ${resp.error}` }] };
      }
      return { content: [{ type: 'text', text: 'Recording paused.' }] };
    },
  );

  /* ------------------------------------------------------------------ */
  /*  resume_recording                                                   */
  /* ------------------------------------------------------------------ */
  server.tool(
    'resume_recording',
    'Resume a paused ScreenRoll recording.',
    {},
    async () => {
      const resp = await bridge.send('resume_recording');
      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to resume: ${resp.error}` }] };
      }
      return { content: [{ type: 'text', text: 'Recording resumed.' }] };
    },
  );

  /* ------------------------------------------------------------------ */
  /*  stop_recording                                                     */
  /* ------------------------------------------------------------------ */
  server.tool(
    'stop_recording',
    'Stop the current ScreenRoll recording. The video file is saved automatically to the Downloads/ScreenRoll folder.',
    {},
    async () => {
      const resp = await bridge.send('stop_recording');
      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to stop: ${resp.error}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'stopped',
                message:
                  'Recording stopped and saved. The file is in the Downloads/ScreenRoll folder. Use list_recordings to see details.',
                ...(resp.data ?? {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /* ------------------------------------------------------------------ */
  /*  get_status                                                         */
  /* ------------------------------------------------------------------ */
  server.tool(
    'get_status',
    'Get the current recording status of ScreenRoll (idle, recording, or paused) and session details.',
    {},
    async () => {
      const resp = await bridge.send('get_status');
      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to get status: ${resp.error}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(resp.data ?? {}, null, 2) }],
      };
    },
  );

  /* ------------------------------------------------------------------ */
  /*  list_recordings                                                    */
  /* ------------------------------------------------------------------ */
  server.tool(
    'list_recordings',
    'List recent ScreenRoll recordings stored in the browser. Returns metadata: title, date, duration, size.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Maximum number of recordings to return (most recent first)'),
    },
    async ({ limit }) => {
      const resp = await bridge.send('list_recordings', { limit });
      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to list recordings: ${resp.error}` }] };
      }
      const recordings = resp.data?.recordings ?? [];
      if (Array.isArray(recordings) && recordings.length === 0) {
        return { content: [{ type: 'text', text: 'No recordings found.' }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(recordings, null, 2) }],
      };
    },
  );

  return server;
}
