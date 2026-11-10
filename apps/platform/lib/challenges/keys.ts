import "server-only";
import { randomBytes } from "node:crypto";
import { deriveChallengeKey, formatChallengeKey } from "@course/shared";

/** `ck_` + 22 base64url characters (128 random bits): the public id of a student's key. */
export function newKeyId(): string {
  return `ck_${randomBytes(16).toString("base64url")}`;
}

function masterSecret(): string {
  const secret = process.env.CHALLENGE_MASTER_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Falta CHALLENGE_MASTER_SECRET (mínimo 32 caracteres)");
  }
  return secret;
}

/** The key the student pastes into their repo. Derived, never stored; shown only once. */
export function shownKey(keyId: string, keyVersion: number): string {
  return formatChallengeKey(deriveChallengeKey(masterSecret(), keyId, keyVersion));
}
