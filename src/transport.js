import { AmbientAPIError } from "./errors.js";

export class HTTPTransport {
  constructor({ baseURL, fetch: fetchImplementation = globalThis.fetch, accessToken } = {}) {
    if (typeof baseURL !== "string" || baseURL.trim() === "") throw new TypeError("baseURL is required");
    if (typeof fetchImplementation !== "function") throw new TypeError("fetch is required");
    this.baseURL = baseURL.replace(/\/$/, "");
    this.fetch = fetchImplementation;
    this.accessToken = accessToken;
  }

  withToken(accessToken) {
    if (typeof accessToken !== "string" || accessToken.trim() === "") throw new TypeError("accessToken is required");
    return new HTTPTransport({ baseURL: this.baseURL, fetch: this.fetch, accessToken });
  }

  async request(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await this.fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let result;
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
      throw new AmbientAPIError(result?.error?.message ?? `Ambient returned HTTP ${response.status}`, {
        status: response.status,
        code: result?.error?.code ?? "http_error",
        requestId: response.headers.get("X-Request-ID") ?? undefined,
        details: result?.error,
      });
    }
    return result;
  }
}

