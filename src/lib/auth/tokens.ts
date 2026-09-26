import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens nunca são armazenados em texto puro: guardamos apenas o hash SHA-256. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
