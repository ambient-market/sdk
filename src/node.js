import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";

export class NodeAgentKey {
  constructor(privateKey) {
    this.privateKey = privateKey;
    const jwk = createPublicKey(privateKey).export({ format: "jwk" });
    if (typeof jwk.x !== "string") throw new TypeError("private key is not Ed25519");
    this.publicKey = jwk.x;
  }

  static generate() {
    return new NodeAgentKey(generateKeyPairSync("ed25519").privateKey);
  }

  static fromPKCS8(encoded) {
    if (typeof encoded !== "string" || encoded === "") throw new TypeError("encoded PKCS8 key is required");
    return new NodeAgentKey(createPrivateKey({
      key: Buffer.from(encoded, "base64url"),
      format: "der",
      type: "pkcs8",
    }));
  }

  exportPKCS8() {
    return this.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  }

  async sign(encodedPayload) {
    if (typeof encodedPayload !== "string" || encodedPayload === "") throw new TypeError("signing payload is required");
    return sign(null, Buffer.from(encodedPayload, "base64url"), this.privateKey).toString("base64url");
  }
}

