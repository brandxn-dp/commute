import { describe, it, expect } from "vitest";
import { parseConfig, detectHostMismatch } from "../src/config/env.js";

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/commute",
  APP_URL: "https://commute.example.com",
  SESSION_SECRET: "x".repeat(32),
  NODE_ENV: "production",
};

describe("config validation (§7.5)", () => {
  it("accepts a valid production config", () => {
    const r = parseConfig(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.PORT).toBe(3000);
      expect(r.config.TRAVEL_PROVIDER).toBe("fixed");
    }
  });

  it("rejects a missing DATABASE_URL and names the variable", () => {
    const r = parseConfig({ ...base, DATABASE_URL: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("DATABASE_URL");
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    const r = parseConfig({ ...base, DATABASE_URL: "mysql://localhost/x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("DATABASE_URL");
  });

  it("rejects a short SESSION_SECRET and names it", () => {
    const r = parseConfig({ ...base, SESSION_SECRET: "tooshort" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("SESSION_SECRET");
  });

  it("rejects APP_URL with a trailing slash", () => {
    const r = parseConfig({ ...base, APP_URL: "https://commute.example.com/" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("APP_URL");
  });

  it("rejects http APP_URL in production (non-local host)", () => {
    const r = parseConfig({ ...base, APP_URL: "http://commute.example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("APP_URL");
  });

  it("allows http://localhost in production", () => {
    const r = parseConfig({ ...base, APP_URL: "http://localhost:3000" });
    expect(r.ok).toBe(true);
  });

  it("rejects an invalid IANA timezone", () => {
    const r = parseConfig({ ...base, DEFAULT_TIMEZONE: "Mars/Phobos" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("DEFAULT_TIMEZONE");
  });

  it("treats an empty-string optional var as unset (Docker/Unraid blank field)", () => {
    // Regression: a blank ADMIN_EMAIL field arrives as "" and must not fail.
    const r = parseConfig({ ...base, ADMIN_EMAIL: "", BOOTSTRAP_TOKEN: "", GOOGLE_CLIENT_ID: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.ADMIN_EMAIL).toBeUndefined();
  });

  it("still rejects a non-empty invalid ADMIN_EMAIL", () => {
    const r = parseConfig({ ...base, ADMIN_EMAIL: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("ADMIN_EMAIL");
  });

  it("treats a blank optional SESSION_SECRET as unset (auto-generated later)", () => {
    const r = parseConfig({ ...base, SESSION_SECRET: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.SESSION_SECRET).toBeUndefined();
  });

  it("reports a blank required var as Required, not a format error", () => {
    const r = parseConfig({ ...base, DATABASE_URL: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/DATABASE_URL.*[Rr]equired|[Rr]equired.*DATABASE_URL/);
  });

  it("requires GOOGLE_ROUTES_API_KEY when TRAVEL_PROVIDER=google", () => {
    const r = parseConfig({ ...base, TRAVEL_PROVIDER: "google" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("GOOGLE_ROUTES_API_KEY");
  });
});

describe("APP_URL / Host mismatch detection (§7.5)", () => {
  it("returns null when hosts match", () => {
    expect(detectHostMismatch("https://commute.example.com", "commute.example.com")).toBeNull();
  });

  it("ignores port on the request host", () => {
    expect(detectHostMismatch("https://commute.example.com", "commute.example.com:443")).toBeNull();
  });

  it("flags a mismatch with a helpful message", () => {
    const msg = detectHostMismatch("https://commute.example.com", "evil.other.com");
    expect(msg).not.toBeNull();
    expect(msg).toContain("does not match");
  });

  it("returns null when the request host is unknown", () => {
    expect(detectHostMismatch("https://commute.example.com", null)).toBeNull();
  });
});
