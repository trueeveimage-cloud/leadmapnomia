import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function idempotencyKey(...parts: Array<string | undefined>): string {
  return sha256(parts.filter(Boolean).join("|")).slice(0, 48);
}
