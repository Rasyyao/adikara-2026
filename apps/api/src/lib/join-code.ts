import { randomInt } from "node:crypto";

export const JOIN_CODE_PATTERN = /^\d{6}$/;

/** A random 6-digit PIN ("004217" is valid). Uses the OS random source, not Math.random. */
export function generateJoinCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
