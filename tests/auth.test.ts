import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.js";
import { createSessionToken, verifySessionToken } from "../src/lib/auth/session.js";
import { generateSecret } from "../src/lib/auth/secret.js";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("Correct horse battery", hash)).toBe(false);
  });

  it("rejects too-short passwords at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("returns false (not throw) on a malformed stored hash", async () => {
    expect(await verifyPassword("whatever", "not-a-valid-hash")).toBe(false);
  });

  it("produces distinct hashes for the same password (random salt)", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
  });
});

describe("session tokens", () => {
  const secret = "a".repeat(40);

  it("verifies a freshly issued token", () => {
    const token = createSessionToken("user-1", secret);
    const payload = verifySessionToken(token, secret);
    expect(payload?.uid).toBe("user-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("user-1", secret);
    expect(verifySessionToken(token, "b".repeat(40))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken("user-1", secret);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", iat: 0, exp: 9e9 }), "utf8").toString(
      "base64url",
    );
    expect(verifySessionToken(`${forged}.${sig}`, secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const token = createSessionToken("user-1", secret, 100, now);
    expect(verifySessionToken(token, secret, now + 200)).toBeNull();
    expect(verifySessionToken(token, secret, now + 50)?.uid).toBe("user-1");
  });

  it("returns null on malformed input", () => {
    expect(verifySessionToken("garbage", secret)).toBeNull();
    expect(verifySessionToken("", secret)).toBeNull();
    expect(verifySessionToken(undefined, secret)).toBeNull();
  });
});

describe("generated session secret", () => {
  it("is long enough and unique per call", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  it("works as a signing key", () => {
    const s = generateSecret();
    const token = createSessionToken("u", s);
    expect(verifySessionToken(token, s)?.uid).toBe("u");
  });
});
