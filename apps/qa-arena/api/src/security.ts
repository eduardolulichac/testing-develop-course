import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
// Deliberately cheap cost: this is a practice app and the seed must be fast.
const SCRYPT = { N: 1024, r: 8, p: 1 };

export function hashPassword(password: string, saltHex = randomBytes(16).toString("hex")): string {
  const key = scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN, SCRYPT);
  return `${saltHex}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, Buffer.from(salt, "hex"), KEYLEN, SCRYPT);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
