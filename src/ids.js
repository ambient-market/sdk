import { randomUUID } from "node:crypto";

export function commandId(prefix = "command") {
  if (typeof prefix !== "string" || !/^[A-Za-z0-9._-]+$/.test(prefix)) {
    throw new TypeError("command ID prefix must contain only letters, numbers, dot, underscore, or hyphen");
  }
  return `${prefix}-${randomUUID()}`;
}

