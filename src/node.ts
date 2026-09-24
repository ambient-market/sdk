import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

export class NodeAgentKey {
  readonly publicKey: string;
  readonly #privateKey: KeyObject;

  private constructor(privateKey: KeyObject) {
    this.#privateKey = privateKey;
    const jwk = createPublicKey(privateKey).export({ format: "jwk" });
    if (typeof jwk.x !== "string") throw new TypeError("private key is not Ed25519");
    this.publicKey = jwk.x;
  }

  static generate(): NodeAgentKey {
    return new NodeAgentKey(generateKeyPairSync("ed25519").privateKey);
  }

  static fromPKCS8(encoded: string): NodeAgentKey {
    if (typeof encoded !== "string" || encoded === "") throw new TypeError("encoded PKCS8 key is required");
    return new NodeAgentKey(createPrivateKey({
      key: Buffer.from(encoded, "base64url"),
      format: "der",
      type: "pkcs8",
    }));
  }

  exportPKCS8(): string {
    return this.#privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  }

  async sign(encodedPayload: string): Promise<string> {
    if (typeof encodedPayload !== "string" || encodedPayload === "") throw new TypeError("signing payload is required");
    return sign(null, Buffer.from(encodedPayload, "base64url"), this.#privateKey).toString("base64url");
  }
}
