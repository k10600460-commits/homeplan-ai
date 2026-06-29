import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // GCM standard
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.AES_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("AES_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt plaintext → "iv:tag:ciphertext" (all hex) */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/** Decrypt "iv:tag:ciphertext" → plaintext */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, tagHex, encHex] = parts;
  const iv        = Buffer.from(ivHex, "hex");
  const tag       = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher  = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/** One-way SHA-256 hash for IP logging (never store raw IPs) */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function signPayload(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getKey()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySignedPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expected = createHmac("sha256", getKey()).update(encodedPayload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
