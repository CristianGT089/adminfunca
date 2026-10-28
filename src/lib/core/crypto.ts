/**
 * Protection of personal data in the database.
 *
 * - `searchHash`: HMAC-SHA256 with DATA_KEY. Deterministic, so it can be used to search by
 *   document number (or by what the ID card barcode reader reads) without storing the number
 *   in clear text. Not reversible.
 * - `encrypt` / `decrypt`: AES-256-GCM with a key derived from DATA_KEY. For fields that must
 *   be shown again (document, phone).
 *
 * DATA_KEY is independent from AUTH_SECRET: rotating sessions does not affect the data, and a
 * leak of the session secret does not expose personal information.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function baseKey(): string {
  const key = process.env.DATA_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATA_KEY is missing or too short (at least 32 characters)");
    }
    return "dev-data-key-do-not-use-in-production-0123456789";
  }
  return key;
}

const encryptionKey = () => createHash("sha256").update(`encryption:${baseKey()}`).digest();
const hashKey = () => createHash("sha256").update(`hash:${baseKey()}`).digest();

/** Normalizes a document or code before hashing: no spaces, dots or dashes, upper case. */
export function normalizeCode(text: string): string {
  return text.replace(/[\s.\-]/g, "").toUpperCase();
}

export function searchHash(text: string): string {
  return createHmac("sha256", hashKey()).update(normalizeCode(text)).digest("hex");
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

/** Null when it cannot be decrypted (for example, if DATA_KEY changed). */
export function decrypt(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    const [iv, tag, data] = encrypted.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "••••1234" from the last digits stored in clear text. */
export function mask(last4: string): string {
  return `••••${last4}`;
}
