import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExtensionBridge } from './bridge.js';

/** Optional Face Cam overlay (tab / custom_tab); normalized in the extension. */
const faceCamSchema = z
  .object({
    enabled: z.boolean(),
    diameterPx: z.number().optional(),
    previewMirrored: z.boolean().optional(),
    exportMirrored: z.boolean().optional(),
    initialLayout: z
      .object({
        centerX: z.number().optional(),
        centerY: z.number().optional(),
        diameterPx: z.number().optional(),
        layoutWidth: z.number().optional(),
        layoutHeight: z.number().optional(),
      })
      .optional(),
    layoutBase: z
      .object({
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .optional(),
    beauty: z
      .object({
        enabled: z.boolean().optional(),
        brightness: z.number().optional(),
        contrast: z.number().optional(),
        saturate: z.number().optional(),
        blurPx: z.number().optional(),
      })
      .optional(),
  })
  .optional();

export function createMcpServer(bridge: ExtensionBridge): McpServer {
  const server = new McpServer({
    name: 'screenroll-mcp',
    version: '1.0.5',
  });

  /* ------------------------------------------------------------------ */
  /*  start_recording                                                    */
  /* ------------------------------------------------------------------ */
  server.tool(
    'start_recording',
    'Start a new screen recording via the ScreenRoll Chrome extension. ' +
      'Modes: "tab" = current active Chrome tab; "desktop" = system share picker (screen/window); ' +
      '"custom_tab" = user draws a region on the active tab (Face Cam needs short side ≥ 200 px). ' +
      'MCP uses the same active tab as the extension popup (frontmost Chrome window).',
    {
      mode: z
        .enum(['tab', 'desktop', 'custom_tab'])
        .default('tab')
        .describe(
          'Capture source: current tab, desktop picker, or custom rectangular region on the current tab',
        ),
      quality: z
        .enum(['LOW', 'MEDIUM', 'HIGH', 'PRESENTATION', 'ULTRA4K'])
        .default('MEDIUM')
        .describe(
          'Video quality preset. LOW=720p, MEDIUM=1080p balanced, HIGH=1080p sharper, PRESENTATION=1080p best (max bitrate), ULTRA4K=4K',
        ),
      includeAudio: z
        .boolean()
        .default(true)
        .describe('Capture system / tab audio'),
      includeMic: z
        .boolean()
        .default(false)
        .describe('Mix in microphone audio'),
      faceCam: faceCamSchema.describe(
        'Optional Face Cam PiP (webcam) composited into the recording. Requires user camera permission when enabled.',
      ),
    },
    async ({ mode, quality, includeAudio, includeMic, faceCam }) => {
      const params: Record<string, unknown> = {
        captureMode: mode,
        quality,
        includeTabAudio: includeAudio,
        includeMic,
      };
      if (faceCam !== undefined) {
        params.faceCam = faceCam;
      }
      const resp = await bridge.send('start_recording', params);

      if (!resp.success) {
        return { content: [{ type: 'text', text: `Failed to start recording: ${resp.error}` }] };
      }
      let hint =
        mode === 'desktop'
          ? 'Recording started. The user may need to select a screen/window in the system dialog.'
          : mode === 'custom_tab'
            ? 'Recording started. The user should select a rectangular region on the page.'
            : 'Recording the current browser tab.';
      if (faceCam?.enabled) {
        hint += ' Face Cam enabled — grant camera if prompted.';
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
                faceCam: faceCam?.enabled === true,
                message: hint,
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
    'Get the current recording status (idle/recording/paused), capture mode, tab title, elapsed time, ' +
      'Face Cam flag, toolbar visibility, and related session fields from the extension.',
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
