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

export function isVersionConflict(error: unknown): error is AmbientAPIError {
  return error instanceof AmbientAPIError && error.status === 409 && error.code === "version_conflict";
}
