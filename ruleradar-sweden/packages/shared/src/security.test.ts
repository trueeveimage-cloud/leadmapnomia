import { describe, expect, it } from "vitest";
import { constantTimeEqual, hashPassword, sha256, verifyPassword } from "./security";

describe("security helpers", () => {
  it("hashes and verifies passwords without storing the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("produces stable token hashes and constant-time comparisons", () => {
    expect(sha256("invite-token")).toBe(sha256("invite-token"));
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });
});
