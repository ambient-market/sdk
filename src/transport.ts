import { AmbientAPIError } from "./errors.js";

interface HTTPTransportOptions {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
  accessToken?: string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

interface APIErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
}

export class HTTPTransport {
  readonly baseURL: string;
  readonly fetch: typeof globalThis.fetch;
  readonly accessToken?: string;

  constructor({ baseURL, fetch: fetchImplementation = globalThis.fetch, accessToken }: HTTPTransportOptions) {
    if (typeof baseURL !== "string" || baseURL.trim() === "") throw new TypeError("baseURL is required");
    if (typeof fetchImplementation !== "function") throw new TypeError("fetch is required");
    this.baseURL = baseURL.replace(/\/$/, "");
    this.fetch = fetchImplementation;
    this.accessToken = accessToken;
  }

  withToken(accessToken: string): HTTPTransport {
    if (typeof accessToken !== "string" || accessToken.trim() === "") throw new TypeError("accessToken is required");
    return new HTTPTransport({ baseURL: this.baseURL, fetch: this.fetch, accessToken });
  }

  async request<TResult>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<TResult> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await this.fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let result: unknown;
    try {
      result = text === "" ? undefined : JSON.parse(text);
    } catch (cause) {
      throw new AmbientAPIError("Ambient returned invalid JSON", {
        status: response.status,
        code: "invalid_response",
        requestId: response.headers.get("X-Request-ID") ?? undefined,
        details: { cause },
      });
    }
    if (!response.ok) {
      const error = (result as APIErrorEnvelope | undefined)?.error;
      throw new AmbientAPIError(error?.message ?? `Ambient returned HTTP ${response.status}`, {
        status: response.status,
        code: error?.code ?? "http_error",
        requestId: response.headers.get("X-Request-ID") ?? undefined,
        details: error,
      });
    }
    return result as TResult;
  }
}
