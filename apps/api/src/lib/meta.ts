import crypto from "node:crypto";
import { env } from "../config/env.js";

export function verifyMetaSignatureOrThrow(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!env.META_APP_SECRET) throw new Error("meta_not_configured");
  if (!signatureHeader) throw new Error("missing_signature");
  // Header format: "sha256=<hex>"
  const [algo, theirHex] = signatureHeader.split("=");
  if (algo !== "sha256" || !theirHex) throw new Error("bad_signature_format");

  const ourHex = crypto.createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(ourHex, "hex");
  const b = Buffer.from(theirHex, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("bad_signature");
}
