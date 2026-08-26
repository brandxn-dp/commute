# Connecting Google Calendar

> **This is used in Phase 6.** The OAuth flow and diagnostics page aren't built
> yet. This guide is here now so you can prepare the Google Cloud side, and
> because the setup is genuinely fiddly and worth getting right once.

Google OAuth for a self-hosted app is painful for three specific reasons, all of
which this guide addresses head-on:

1. Redirect URIs must be **HTTPS on a real host** (except `localhost`).
2. An app left in **Testing** mode expires refresh tokens after **7 days**, so
   sync silently dies a week after you connect it.
3. The Cloud Console's error messages are unhelpful.

You must create **your own** Google Cloud project and OAuth client — a
self-hosted app cannot ship a shared client secret for a Calendar-scoped app.

---

## 1. Create a project

1. Go to <https://console.cloud.google.com/>.
2. Top bar → project picker → **New Project**. Name it e.g. `commute`. Create,
   then select it.

## 2. Enable the Google Calendar API

1. **APIs & Services → Library**.
2. Search **Google Calendar API** → **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. **User type: External** → Create. (Internal is only available for Google
   Workspace orgs.)
3. Fill required fields (app name, your support email, developer email). You can
   leave logo/links blank.
4. **Scopes** → Add:
   - `https://www.googleapis.com/auth/calendar` — read/write calendars & events
   - `https://www.googleapis.com/auth/calendar.events`
   - `openid`, `email`, `profile` (basic identity)
5. **Test users** → add your own Google account (needed while in Testing).
6. Save.

### ⚠️ The 7-day token trap — do this to avoid it

While the app's **Publishing status is "Testing"**, Google expires refresh
tokens after 7 days and your sync will break a week after connecting.

**Fix:** on the OAuth consent screen, click **Publish App** and confirm, moving
**Publishing status → In production**. Because the Calendar scope is a
*sensitive* scope (not *restricted*), you can run in production for personal use
(under 100 users) **without** completing Google's full verification. You will see
an **"Google hasn't verified this app"** warning the first time you connect —
click **Advanced → Go to commute (unsafe)** to proceed. After this, refresh
tokens no longer expire on a 7-day clock.

Commute's diagnostics page (Phase 6) detects if you're still in Testing mode and
warns you *before* tokens expire.

## 4. Create the OAuth client credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. **Application type: Web application**.
3. **Authorized redirect URIs** — add **both** of these, using *your* `APP_URL`:
   - `${APP_URL}/api/auth/google/callback` — the OAuth sign-in / connect callback
   - `${APP_URL}/api/google/push` — the webhook/push channel endpoint

   Example for `APP_URL=https://commute.example.com`:
   - `https://commute.example.com/api/auth/google/callback`
   - `https://commute.example.com/api/google/push`

   > These paths are the exact values the diagnostics page will display for your
   > deployment. If `APP_URL` doesn't match the host users actually reach, the
   > callback fails with an opaque `redirect_uri_mismatch` — set `APP_URL`
   > correctly first.
4. Create. Copy the **Client ID** and **Client secret**.

## 5. Give the credentials to Commute

Set these environment variables and restart the container:

```
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
```

Then, in the app (Phase 6): **Settings → Integrations → Connect Google
Calendar**, approve access (clicking through the unverified-app warning), and
choose which calendars are busy-sources and/or write-targets.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `redirect_uri_mismatch` | The redirect URI registered in step 4 doesn't exactly match `${APP_URL}/api/auth/google/callback`. Check scheme, host, and no trailing slash. |
| Sync stops ~7 days after connecting | App still in **Testing**. Publish to production (step 3). Reconnect. |
| `access_denied` | Your account isn't a test user (while in Testing), or you declined a scope. |
| Diagnostics shows credentials missing | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` not set or not picked up — restart after setting them. |

## Prefer to avoid Google Cloud entirely?

A **CalDAV** path is planned (Google Calendar also speaks CalDAV) so you can sync
without creating a Cloud project. Google is the primary, better-supported path
(webhook push, richer sync); CalDAV trades that for zero OAuth setup.
