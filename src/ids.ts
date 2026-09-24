export function commandId(prefix = "command"): string {
  if (typeof prefix !== "string" || !/^[A-Za-z0-9._-]+$/.test(prefix)) {
    throw new TypeError("command ID prefix must contain only letters, numbers, dot, underscore, or hyphen");
  }
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    throw new TypeError("commandId requires crypto.randomUUID");
  }
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
