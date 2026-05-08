import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/** Cryptographically random 32-byte hex token for the player cookie. */
export function newCookieToken(): string {
  return randomBytes(32).toString("hex");
}

/** 6-char join code, no ambiguous chars. Caller is responsible for collision retry. */
export function newJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
