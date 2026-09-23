export class AmbientAPIError extends Error {
  constructor(message, { status, code, requestId, details } = {}) {
    super(message);
    this.name = "AmbientAPIError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

