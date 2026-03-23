export enum ErrorCode {
  INVALID_WS_PORT = 'E_INVALID_WS_PORT',
  PORT_IN_USE_FOREIGN = 'E_PORT_IN_USE_FOREIGN',
  PORT_STILL_IN_USE = 'E_PORT_STILL_IN_USE',
  INSTANCE_ALREADY_RUNNING = 'E_INSTANCE_ALREADY_RUNNING',
  MISSING_TOKEN = 'E_MISSING_TOKEN',
}

export class ScreenRollMcpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'ScreenRollMcpError';
  }
}

export function toScreenRollMcpError(err: unknown): ScreenRollMcpError {
  if (err instanceof ScreenRollMcpError) return err;
  return new ScreenRollMcpError(
    ErrorCode.PORT_STILL_IN_USE,
    err instanceof Error ? err.message : String(err),
  );
}
