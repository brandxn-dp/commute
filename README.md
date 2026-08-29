# Commute

A self-hosted, **location-aware auto-scheduling calendar** PWA. It treats
physical location and real travel time as first-class scheduling constraints:
a class that ends at 8:00 PM in one town does not free up 8:00 PM if your next
commitment is 35 minutes away, and Commute refuses to schedule as if it did.

Runs as a single Docker container on your own server (built for Unraid, works
anywhere Docker does), installs as a PWA on iOS/Android, and syncs two-way with
Google Calendar.

> **Status: Phase 2 of 7 — calendar core.**
> Deployment plumbing (Phase 1) plus a working calendar: sign-in, manual events
> and tasks, and a drag-and-drop week/day view. See
> [What works today](#what-works-today) for an honest picture. Auto-scheduling,
> places/travel, and Google sync come in later phases.

---

## What works today

**Phase 1 — deployment plumbing** (proven solid before any feature, because the
painful failures in comparable self-hosted projects are boot/ops failures, not
feature bugs):

- ✅ Single Docker image, multi-arch (amd64 + arm64), published to GHCR by CI.
- ✅ `docker-compose.yml` (app + Postgres) and an Unraid template.
- ✅ **Config validation at startup** — invalid/missing env vars fail loudly and
  name the offending variable; the app never boots half-configured.
- ✅ **Migrations pinned and fatal** — applied by a pinned migrator from
  committed SQL; a migration failure logs loudly and **exits non-zero** rather
  than serving a broken schema.
- ✅ **Schema-verifying health check** at `/api/health` — returns `503` if the
  DB is unreachable *or* required tables are missing, not just if the process
  is alive.
- ✅ **First-boot bootstrap** — on an empty database, creates the settings row
  and makes the first account the owner/admin. `ADMIN_EMAIL` and a
  `promote-admin` CLI are escape hatches.
- ✅ **Legible startup logs** — a healthy boot is a short, clean sequence.

**Phase 2 — calendar core:**

- ✅ **Sign-in.** First run creates the owner account (password set on the setup
  screen); after that it's a normal login. Sessions are stateless signed cookies
  (Node scrypt password hashing, HMAC-signed tokens — no extra crypto deps).
- ✅ **Manual events** — create, edit, move, resize, delete. Events can carry a
  location (freeform for now; becomes a travel input in Phase 4).
- ✅ **Drag-and-drop week/day view** — click-drag to create, drag to move
  (across days), drag the bottom edge to resize. 15-minute snapping, overlap
  lanes, a "now" line. Rendered **timezone-correctly** (stored UTC, shown in the
  display zone) with DST handled through Luxon zones — a lecture won't drift
  across a DST change (there's a test for exactly that).
- ✅ **Tasks backlog** — create/edit/delete tasks with the scheduling inputs the
  Phase 3 solver will use (duration, deadline, priority, splittable + min chunk,
  energy). Traffic-light priority colouring; mark done/reopen.

## What does **not** work yet

- ❌ The scheduling engine — tasks are a manual backlog; nothing auto-places them
  onto the calendar yet (Phase 3).
- ❌ Recurring events (the `protected` type exists but recurrence rules don't).
- ❌ Places, travel time, feasibility filtering (Phases 4–5).
- ❌ Google Calendar sync (Phase 6).
- ❌ PWA install / offline / push notifications (Phase 7).

---

## Quick start (Docker Compose)

Requires Docker + Docker Compose.

```bash
cp .env.example .env
# Edit .env: at minimum set SESSION_SECRET (openssl rand -base64 48) and APP_URL.
docker compose up -d
```

Then open <http://localhost:3000> and check <http://localhost:3000/api/health>.

To build the image from source instead of pulling from GHCR, uncomment the
`build: .` line under the `app` service in `docker-compose.yml` and run
`docker compose up -d --build`.

On **Unraid**, follow [SETUP_UNRAID.md](SETUP_UNRAID.md).

---

## Local development

Requires Node 22 and a PostgreSQL 15+ you can point at.

```bash
npm install
cp .env.example .env          # set DATABASE_URL to your local Postgres
npm run db:migrate            # apply migrations
npm run startup               # run the pre-flight (config + migrate + bootstrap)
npm run dev                   # start Next.js on http://localhost:3000
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next config) |
| `npm test` | Vitest. DB-backed tests run only when `TEST_DATABASE_URL` is set. |
| `npm run db:generate` | Generate a new SQL migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run promote-admin -- you@example.com` | Promote/create an admin account |

### Running the full test suite

The bootstrap and health tests need a real Postgres. Point `TEST_DATABASE_URL`
at a server where the test user can `CREATE DATABASE` (each test provisions its
own throwaway database):

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

CI runs these against a `postgres` service automatically.

---

## Operational guarantees

These come from real, painful failures in a comparable project and are enforced
in code and tests (see [ARCHITECTURE.md](ARCHITECTURE.md) §Operational):

1. **No package manager at runtime.** Migrations are applied by a pinned,
   pre-bundled migrator — never `npx <floating-version>`.
2. **Migrations are fatal.** Failure exits non-zero; the app does not start.
3. **Health verifies schema.** "Up but empty" reports unhealthy.
4. **Bootstrap is automatic.** An empty DB becomes a usable app with an admin.
5. **Config is validated.** Bad env vars are named and fatal, including an
   `APP_URL` / `Host` mismatch (the classic silent OAuth-callback breaker).
6. **Legible logs.** No stack-trace spam on a healthy boot.

---

## Stack & key decisions

| Choice | Why |
| --- | --- |
| **Next.js (App Router)** | Mature PWA/UI ecosystem. Long-running work (scheduler, sync, push timing) runs in a **separate worker** — that split, not the framework, is the real design point. |
| **Drizzle ORM** | Plain-SQL migrations that are transparent, trivially made fatal, and greppable in review; no runtime query-engine binary (cleaner multi-arch image). Directly avoids the migration footgun that motivated this project. |
| **PostgreSQL 15+** | Relational scheduling data; also backs the job queue. |
| **pg-boss (Postgres-backed queue)** | Avoids adding Redis — keeps the self-hosted footprint to "app + Postgres". *(Wired up in a later phase.)* |
| **esbuild-bundled ops scripts** | Pre-flight/migrator/CLI ship as self-contained JS so the runtime image needs neither a package manager nor `tsx`. |

Deployment target is single-user (one owner account). Travel uses one global
default transport mode; Google Calendar is the primary sync path; the scheduler
**proposes** changes and never applies them without your approval.

## License

AGPL-3.0-only.
