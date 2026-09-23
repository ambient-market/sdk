import type { AgentSigner } from "./index.js";

export class NodeAgentKey implements AgentSigner {
  readonly publicKey: string;
  static generate(): NodeAgentKey;
  static fromPKCS8(encoded: string): NodeAgentKey;
  exportPKCS8(): string;
  sign(encodedPayload: string): Promise<string>;
}
