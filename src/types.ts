/** Actions the MCP server can send to the extension via WebSocket. */
export type BridgeAction =
  | 'start_recording'
  | 'stop_recording'
  | 'pause_recording'
  | 'resume_recording'
  | 'get_status'
  | 'list_recordings';

export interface BridgeRequest {
  id: string;
  action: BridgeAction;
  params?: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface BridgeAuthMessage {
  type: 'auth';
  extensionId: string;
}

export interface RecordingMeta {
  id: number;
  tabTitle: string;
  timestamp: number;
  duration: number;
  size: number;
  mimeType: string;
  captureMode: string;
  pageUrl?: string;
  hasThumbnail: boolean;
  hasAudio: boolean;
}

export const WS_PORT = 9877;
export const REQUEST_TIMEOUT_MS = 30_000;
