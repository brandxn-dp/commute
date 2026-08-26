import { defineConfig } from "drizzle-kit";

// Migrations are emitted as plain SQL into ./drizzle and applied at boot by a
// pinned migrator (src/db/migrate.ts) — never by invoking a package manager at
// runtime. `drizzle-kit generate` is a build-time author tool only.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // drizzle-kit reads DATABASE_URL from the environment for `push`/`studio`.
  // Migration *generation* does not need a live DB, but the URL is read when present.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/commute",
  },
  strict: true,
  verbose: true,
});
