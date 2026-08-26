/**
 * Startup configuration validation (operational requirement §7.5).
 *
 * Every environment variable the app depends on is validated here with a zod
 * schema. On failure we print a human-readable message naming the offending
 * variable(s) and the process exits non-zero — the app never boots in a
 * half-configured state.
 *
 * This module is deliberately dependency-light and framework-agnostic so it can
 * be imported by the Next server, the worker, migration scripts, and tests.
 */
import { z } from "zod";

const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      // Throws RangeError for an invalid IANA zone.
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid IANA timezone, e.g. America/New_York" },
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z
      .string()
      .min(1, "is required")
      .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
        message: "must be a postgres:// connection string",
      }),

    APP_URL: z
      .string()
      .min(1, "is required")
      .url("must be a full URL including scheme, e.g. https://commute.example.com")
      .refine((v) => !v.endsWith("/"), { message: "must not have a trailing slash" }),

    SESSION_SECRET: z
      .string()
      .min(32, "must be at least 32 characters (generate with: openssl rand -base64 48)"),

    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DEFAULT_TIMEZONE: timezoneSchema.default("America/New_York"),

    // Optional bootstrap escape hatches.
    ADMIN_EMAIL: z.string().email().optional(),
    BOOTSTRAP_TOKEN: z.string().min(16).optional(),

    // Travel provider selection (used from Phase 4). Defaults to the no-API-key path.
    TRAVEL_PROVIDER: z.enum(["fixed", "google"]).default("fixed"),

    // Google config is not required until Phase 6; validated as optional here.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ROUTES_API_KEY: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    // Production must not be served over plain HTTP (OAuth + cookies break, and
    // it is almost always a misconfiguration).
    if (cfg.NODE_ENV === "production" && cfg.APP_URL.startsWith("http://")) {
      const host = safeHost(cfg.APP_URL);
      const isLocal = host === "localhost" || host === "127.0.0.1";
      if (!isLocal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_URL"],
          message: "must be https:// in production (got http://)",
        });
      }
    }
    // If Google Routes is selected, its key must be present.
    if (cfg.TRAVEL_PROVIDER === "google" && !cfg.GOOGLE_ROUTES_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_ROUTES_API_KEY"],
        message: "is required when TRAVEL_PROVIDER=google",
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate configuration. Returns a typed config on success.
 * On failure returns a list of human-readable errors (does not throw), so the
 * caller controls how loudly to fail and can be unit-tested.
 */
export function parseConfig(
  raw: NodeJS.ProcessEnv = process.env,
): { ok: true; config: AppConfig } | { ok: false; errors: string[] } {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `  - ${name} ${issue.message}`;
  });
  return { ok: false, errors };
}

/**
 * Load config or exit the process. Use this at real startup entrypoints.
 */
export function loadConfigOrExit(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = parseConfig(raw);
  if (!parsed.ok) {
    process.stderr.write(
      "Configuration error — the following environment variables are invalid:\n" +
        parsed.errors.join("\n") +
        "\n\nSee .env.example for documentation of every variable.\n",
    );
    process.exit(1);
  }
  return parsed.config;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Detect an APP_URL / request Host-header mismatch (operational requirement §7.5).
 *
 * A mismatch here is the classic cause of OAuth callbacks silently failing: the
 * redirect URI is built from APP_URL but the browser arrives on a different host,
 * so Google rejects the callback with an opaque error. Callers (middleware /
 * diagnostics) use this to surface the problem explicitly.
 *
 * Returns null when they match (or cannot be compared), or a description string.
 */
export function detectHostMismatch(
  appUrl: string,
  requestHost: string | null | undefined,
): string | null {
  if (!requestHost) return null;
  const expected = safeHost(appUrl);
  if (!expected) return null;
  // requestHost may include a port; compare hostname portions.
  const requestHostname = requestHost.split(":")[0]?.toLowerCase();
  if (!requestHostname) return null;
  if (requestHostname !== expected.toLowerCase()) {
    return (
      `APP_URL host "${expected}" does not match the request Host header ` +
      `"${requestHostname}". OAuth callbacks and absolute links will break until ` +
      `APP_URL is set to the address users actually reach this app on.`
    );
  }
  return null;
}
