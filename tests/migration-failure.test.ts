import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrateScript = join(here, "..", "src", "db", "migrate.ts");

/**
 * Run the migrate script in a child process with the tsx loader and resolve
 * with its exit code. Uses `node --import tsx` so it is cross-platform (no
 * reliance on shell PATH or .bin shims).
 */
function runMigrate(env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", migrateScript], {
      env: { ...process.env, ...env },
      stdio: "ignore",
    });
    child.on("exit", (code) => resolve(code ?? -1));
    child.on("error", () => resolve(-1));
  });
}

const validEnv: NodeJS.ProcessEnv = {
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32),
  NODE_ENV: "test",
};

describe("migration failure is fatal (§7.2)", () => {
  it("exits non-zero when the database is unreachable", async () => {
    const code = await runMigrate({
      ...validEnv,
      // Nothing is listening on this port → connection refused → must fail hard.
      DATABASE_URL: "postgres://u:p@127.0.0.1:59999/nope",
    });
    expect(code).not.toBe(0);
  }, 20_000);

  it("exits non-zero when configuration is invalid", async () => {
    const code = await runMigrate({
      ...validEnv,
      SESSION_SECRET: "short", // fails validation
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/commute",
    });
    expect(code).not.toBe(0);
  }, 20_000);
});
