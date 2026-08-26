# Architecture

This document is the running design record. Sections are marked **[implemented]**
or **[planned: Phase N]** so it stays honest as the build progresses. Phase 1
implements only the deployment skeleton; the scheduler and travel designs below
are recorded now (per the brief's request to settle them before Phase 5) but not
yet built.

---

## 1. Runtime shape

```
                    ┌──────────────────────────────────────────┐
                    │            Single Docker image           │
                    │                                          │
  Browser / PWA ───▶│  Next.js server (App Router)             │
                    │    - UI (React Server Components)        │
                    │    - route handlers / API               │
                    │    - /api/health (schema-verifying)      │
                    │                                          │
                    │  Worker process            [planned: P3+]│
                    │    - pg-boss job runner                  │
                    │    - scheduling runs, Google sync,       │
                    │      "leave now" push timing             │
                    │                                          │
                    │  Pre-flight (entrypoint)   [implemented] │
                    │    - config validation                   │
                    │    - migrations (fatal)                  │
                    │    - first-boot bootstrap                │
                    └───────────────┬──────────────────────────┘
                                    │
                             PostgreSQL 15+
                    (app data + pg-boss job queue)
```

The **framework choice (Next.js) is secondary to the process split.** Neither
Next nor Remix has a good story for long-running background work, and Commute's
core loop — periodically (re)computing schedules, processing Google webhook
deltas, and firing departure alerts — is exactly that. So a dedicated worker
process runs in the same image, backed by **pg-boss** (a Postgres-backed queue)
specifically to avoid introducing Redis and keep the self-hosted footprint at
"app + Postgres".

### Boot sequence (entrypoint) — [implemented]

`scripts/entrypoint.sh` runs a fatal pre-flight before the server starts:

1. **Config** (`src/config/env.ts`) — zod-validate every variable; on failure
   print human-readable, variable-named errors and exit 1.
2. **Migrations** (`src/db/migrate.ts`) — apply committed SQL via the pinned
   `drizzle-orm` migrator; on failure log loudly and exit 1. Reports counts
   (newly applied / already present / total).
3. **Bootstrap** (`src/db/bootstrap.ts`) — on an empty DB create the settings
   row and seed the owner/admin; idempotent thereafter.

Only if all three succeed does `exec node server.js` start the HTTP server. The
pre-flight and CLI are esbuild-bundled to self-contained JS (`dist/`) so the
runtime needs no package manager and no `tsx`.

---

## 2. Data model

### Implemented (Phase 1)

- **`settings`** — a singleton row (enforced by a `CHECK (id = 1)` constraint).
  Holds display `timezone`, `planning_horizon_weeks` (default 8), and
  `travel_monthly_call_ceiling`. All timestamps app-wide are stored UTC; this
  timezone is display/recurrence only.
- **`users`** — accounts. `is_owner` / `is_admin` flags. Single-user deployment,
  but modelled as a real table so a household can be added later without a
  rewrite. `password_hash` is nullable until auth lands in Phase 2 (bootstrap
  can seed a shell owner from `ADMIN_EMAIL`).

`REQUIRED_TABLES` in `src/db/schema.ts` is the list the health check verifies;
it grows as tables are added.

### Planned data model (Phases 2–6)

- **`calendars`** — synced Google calendars; per-calendar `is_busy_source` and
  `is_write_target` toggles. One dedicated "Commute" calendar is the write
  target so scheduled blocks are trivially separable.
- **`events`** — concrete calendar entries (fixed lectures, shifts, real events).
  Immovable/protected. Carry an optional `place_id` or freeform location.
- **`tasks`** — flexible work to be scheduled. Fields: duration estimate,
  deadline, earliest start, priority, `place_id` (nullable = location-flexible),
  splittable + min chunk size, energy tag (deep/shallow), allowed windows.
- **`placements`** — the scheduler's output: a task (or task chunk) assigned to a
  time range. `locked` placements are immovable across runs.
- **`travel_legs`** — reserved travel between consecutive located items; rendered
  as distinct blocks, not padding.
- **`places`** — saved locations: label, address, geocoded `place_id` + lat/lng,
  optional default transport mode (nullable; global default used otherwise).
- **`scheduling_windows`** — named masks (e.g. "study hours") with per-day/time
  availability. Multiple independent windows, not one global range.
- **`travel_cache`** — see §4.
- **`google_tokens`**, **`sync_state`** — OAuth tokens and per-calendar sync
  tokens for incremental sync.

---

## 3. Scheduling engine — [planned: Phase 3]

A **deterministic constraint solver**. No LLM in the scheduling path: it must be
fast, offline-capable, reproducible, and free to run.

### Algorithm sketch

1. **Materialize the horizon.** Expand recurring protected blocks (lectures,
   shifts, gym, commute) across the planning horizon (default 8 weeks) in local
   wall-clock time, so DST transitions are handled correctly (§6).
2. **Build the free/busy timeline** from protected blocks + external busy
   sources, subtracting per-item buffers.
3. **Order tasks** strictly by (priority, deadline). A high-priority item due
   tomorrow is always placed before a low-priority item due in two weeks. This
   ordering is the single most-tested property (see §Testing).
4. **Place greedily with backtracking.** For each task, find the earliest valid
   slot within its allowed windows and before its deadline. Splittable tasks
   fragment across gaps, never below their minimum chunk size.
5. **Travel feasibility filter** (Phase 4) — a candidate slot is valid only if
   the user can arrive from the previous located item *and* reach the next one.
   Infeasible slots are discarded, not flagged.
6. **Deadline-risk detection** — if remaining capacity before a deadline is
   insufficient, warn N days ahead and name the commitments causing the squeeze.
7. **Locking & idempotency** — locked placements are fixed inputs. A run
   produces a **preview diff**; nothing is written until the user approves
   (deployment decision: *auto-propose, manual apply*).

### Why deterministic / greedy-with-backtracking

The problem is a resource-constrained scheduling problem; a full ILP is overkill
for a single user's 8-week horizon and would be slow and opaque. A priority-
ordered greedy pass with bounded backtracking is fast, explainable ("it moved X
because Y"), and reproducible — which matters for the previewable-diff UX.

---

## 4. Travel time & cache — [planned: Phases 4–5]

### Provider interface

```
interface TravelProvider {
  matrix(origins: Place[], dests: Place[], opts: {
    mode: TransportMode;
    departureBucket: { dayOfWeek: number; hourBucket: number };
  }): Promise<Map<PairKey, DurationSeconds>>;
}
```

- **`FixedMatrixProvider`** (built first, Phase 4) — durations hand-entered
  between saved Places. Works with **zero API keys**.
- **`GoogleRoutesProvider`** (Phase 5) — `computeRouteMatrix` with
  departure-time-aware traffic.

### Cost control (hard requirement)

- **Persistent cache** keyed on
  `(origin_place_id, dest_place_id, mode, day_of_week, hour_bucket)` with a
  configurable TTL (default 30 days). *Mode is part of the key* (a transit leg
  and a driving leg are not interchangeable).
- Addresses are **geocoded to a stable `place_id` at Place-creation time** so
  the key is stable even for freeform addresses.
- **Batch via the matrix endpoint** over the set of *distinct* Places in a plan —
  feasibility is O(places²) lookups, never O(slots) API calls.
- **Hard monthly call ceiling** (in settings). When hit, degrade to cached/fixed
  values and show a banner — never fail or silently overspend.
- **Every cache miss is logged** so real cost is visible.

### A deliberate simplification

Eight weeks out, `computeRouteMatrix` traffic prediction degrades to "typical"
anyway, so the `(day_of_week, hour_bucket)` bucket is treated as *typical
traffic*, not a live per-date forecast. This makes the cache far more effective
without meaningfully hurting accuracy.

---

## 5. Google integration — [planned: Phase 6]

- OAuth 2.0, two-way sync, incremental via sync tokens, webhook push where
  available. Multiple calendars, each toggleable as busy-source / write-target.
- Scheduled blocks write to a dedicated calendar.
- Event `location` is read into the travel graph.
- **Diagnostics page** reports the exact redirect URI this deployment expects,
  whether credentials are present, token expiry, last sync time, and the last
  sync error verbatim — and detects Testing-mode 7-day token expiry *before* it
  breaks sync. See [SETUP_GOOGLE.md](SETUP_GOOGLE.md).
- **CalDAV** is a planned alternative path so the app is usable without Google
  Cloud (deployment priority: Google first).

---

## 6. Timezone & DST correctness

All timestamps are stored in UTC. A single display timezone (from settings) is
used for rendering and, critically, for **recurrence expansion in local wall-
clock time**. A semester spans a DST change: a lecture defined as "Mondays
18:00 local" must stay at 18:00 local across the transition, not drift by an
hour. Recurrence is therefore expanded against the IANA zone, not by adding
fixed UTC offsets. This is covered by dedicated tests in Phase 3.

---

## Operational requirements — how each is enforced

| Requirement | Enforcement | Test |
| --- | --- | --- |
| Pin every version; no runtime package manager | Exact versions in `package.json` + lockfile; migrator/CLI esbuild-bundled | build |
| Migrations fatal on failure | `src/db/migrate.ts` / `startup.ts` exit non-zero | `tests/migration-failure.test.ts` |
| Health verifies schema | `src/lib/health.ts` checks `information_schema` | `tests/health.test.ts` |
| Automatic first-boot bootstrap | `src/db/bootstrap.ts` | `tests/bootstrap.test.ts` |
| Config validation + `APP_URL`/Host mismatch | `src/config/env.ts` (zod) | `tests/config-validation.test.ts` |
| Legible startup logs | `src/lib/logger.ts` + ordered pre-flight | manual / boot log |
