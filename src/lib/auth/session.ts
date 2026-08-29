/**
 * Stateless signed session tokens.
 *
 * For a single-user deployment a server-side session table is overkill. Instead
 * we issue a compact token: base64url(payload).base64url(HMAC-SHA256(payload)).
 * The HMAC is keyed on SESSION_SECRET, so the token is tamper-evident, and the
 * payload carries an expiry. This module is framework-agnostic (no cookies here)
 * so it is trivially unit-testable; the Next cookie adapter lives in current.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  /** user id */
  uid: string;
  /** issued-at (epoch seconds) */
  iat: number;
  /** expires-at (epoch seconds) */
  exp: number;
}

export const SESSION_COOKIE = "commute_session";
export const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createSessionToken(
  uid: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  now: number = Math.floor(Date.now() / 1000),
): string {
  const payload: SessionPayload = { uid, iat: now, exp: now + ttlSeconds };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a token. Returns the payload when the signature is valid and the token
 * has not expired; otherwise null. Never throws on malformed input.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
