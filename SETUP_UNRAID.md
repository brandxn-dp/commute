# Running Commute on Unraid

Commute is one container plus a PostgreSQL container. This guide covers both.

> Replace `brandxn-dp` with the GitHub org/user this repo is published under wherever
> it appears (image name, template URL).

## 0. Prerequisites

- Unraid 6.10+ with the **Community Applications** plugin.
- A share/appdata path for Postgres data.
- A way to reach the app over HTTPS on a real hostname if you plan to use Google
  Calendar later (a reverse proxy such as Nginx Proxy Manager or SWAG). HTTP on
  the LAN is fine for Phases 1–5.

## 1. Create the PostgreSQL container

Commute needs PostgreSQL 15 or newer. The simplest path is the official
`postgres` image from Community Applications.

1. **Apps** tab → search **postgres** → install the `postgres` template.
2. Set:
   - **Repository:** `postgres:16.6-bookworm` (pin a version; don't use `latest`).
   - `POSTGRES_USER` = `commute`
   - `POSTGRES_PASSWORD` = *(a strong password you choose)*
   - `POSTGRES_DB` = `commute`
   - **Appdata path** → e.g. `/mnt/user/appdata/commute-db` mapped to
     `/var/lib/postgresql/data`.
   - Leave the port on the internal Docker network; Commute reaches it by
     container name. If you expose it, restrict it to your LAN.
3. Apply and confirm the container starts.

Note the database's **container name** (e.g. `postgres`) and its published port.

> **Important — Unraid networking.** On Unraid's **default `bridge` network,
> containers cannot reach each other by name** (`@postgres:5432` fails with
> `getaddrinfo ENOTFOUND postgres`). Use one of these for the DB host:
>
> - **Host IP + published port (simplest):** if the Postgres container publishes
>   its port (you'll see `0.0.0.0:5432->5432/tcp`), use the Unraid server's LAN
>   IP, e.g. `@192.168.1.50:5432`.
> - **Shared custom network:** create/attach both containers to the same
>   user-defined Docker network (Edit container → *Network Type*), then the
>   container name (`@postgres:5432`) resolves.
>
> Container names only work on the second option — the default bridge does not
> provide name resolution.

## 2. Add the Commute template

Until Commute is in the Community Applications store, add its template by URL:

1. **Docker** tab → **Add Container**.
2. In **Template**, paste:
   `https://raw.githubusercontent.com/brandxn-dp/commute/main/unraid-template.xml`
3. Fill in the fields:

   | Field | Value |
   | --- | --- |
   | **WebUI Port** | `3000` (or any free host port) |
   | **DATABASE_URL** | `postgres://commute:YOURPASSWORD@HOST:5432/commute` — set `HOST` per the networking note above (Unraid LAN IP if the port is published, or the container name only if on a shared custom network). **Not** `@postgres` on the default bridge. |
   | **APP_URL** | The exact URL you'll reach the app on, e.g. `https://commute.example.com` or `http://TOWER-IP:3000`. **No trailing slash.** |
   | **SESSION_SECRET** | *Optional* — leave blank to have the app generate and persist one automatically. Set a 32+ char value only to control it explicitly. |
   | **DEFAULT_TIMEZONE** | e.g. `America/New_York` |
   | **ADMIN_EMAIL** *(optional)* | Email guaranteed admin on first boot |

4. **Apply.** Watch the container log — a healthy first boot looks like:

   ```
   [entrypoint] Commute starting…
   INFO  Config loaded and validated.
   INFO  Migrations OK.  newly_applied=1 already_applied=0 total=1
   INFO  Bootstrap: created settings row with defaults.
   INFO  Pre-flight complete.
   [entrypoint] Pre-flight OK — starting server on port 3000
   ```

   If a migration or config check fails, the container **exits** (by design) and
   the log names the problem. Fix it and restart — the app never runs against a
   broken database.

## 3. Verify

- Open the WebUI. You should see the Commute status page.
- Hit `/api/health`. A healthy deployment returns HTTP `200` and
  `{"status":"healthy", ...}`. If it returns `503` with missing tables, the
  database didn't migrate — check `DATABASE_URL` and the DB container.

## 4. APP_URL and reverse proxies

`APP_URL` must match the address users actually reach. If you put Commute behind
a reverse proxy on `https://commute.example.com`, set `APP_URL` to exactly that.
A mismatch between `APP_URL` and the incoming `Host` header is detected and
surfaced by the app — it's the classic cause of silent OAuth-callback breakage
in Phase 6, so get it right now.

## 5. Updates

Because images are published to GHCR with proper tags, Unraid's **Check for
Updates** works normally. Pin to a specific version tag instead of `latest` if
you prefer to control when you upgrade.

## Recovery: locked out of admin

If you ever end up with no admin account, open the Commute container's console
and run:

```bash
node dist/cli/promote-admin.cjs you@example.com
```

This promotes (or creates) that account as owner/admin.
