/**
 * Minimal, legible structured logger.
 *
 * Operational requirement §7.6: startup logs must be legible. A healthy boot
 * should read as a short sequence of clear status lines — no stack-trace spam.
 * Errors are logged loudly and with context; healthy events are terse.
 */

type Level = "info" | "warn" | "error";

const LEVEL_TAG: Record<Level, string> = {
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const base = `${ts} ${LEVEL_TAG[level]} ${msg}`;
  const stream = level === "error" ? process.stderr : process.stdout;
  if (fields && Object.keys(fields).length > 0) {
    const rendered = Object.entries(fields)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(" ");
    stream.write(`${base}  ${rendered}\n`);
  } else {
    stream.write(`${base}\n`);
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v.includes(" ") ? `"${v}"` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
