/**
 * Password hashing using Node's built-in scrypt.
 *
 * No native or third-party dependency (keeps the multi-arch image clean). scrypt
 * is memory-hard and a sound choice for password storage. Hashes are stored as:
 *
 *   scrypt$N$r$p$<saltHex>$<hashHex>
 *
 * embedding the parameters so they can be tuned later without breaking existing
 * hashes.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Cost parameters. N must be a power of two. These are a reasonable interactive
// login cost; maxmem is raised to accommodate N.
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, "hex");
  const expected = Buffer.from(parts[5]!, "hex");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAXMEM });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
