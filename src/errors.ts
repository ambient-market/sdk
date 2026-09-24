import type { AmbientAPIErrorOptions } from "./types.js";

export class AmbientAPIError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(message: string, { status, code, requestId, details }: AmbientAPIErrorOptions = {}) {
    super(message);
    this.name = "AmbientAPIError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}
