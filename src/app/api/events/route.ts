import { NextResponse } from "next/server";
import { requireUser, zodBadRequest, jsonError } from "../../../lib/api.js";
import { eventCreateSchema } from "../../../lib/validation.js";
import { listEvents, createEvent } from "../../../lib/repos/events.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/events?from=ISO&to=ISO — events overlapping the window. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return jsonError("from and to (ISO timestamps) are required", 400);
  }

  const rows = await listEvents(auth.db, auth.user.id, from, to);
  return NextResponse.json({ events: rows });
}

/** POST /api/events — create an event. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = eventCreateSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  const row = await createEvent(auth.db, auth.user.id, parsed.data);
  return NextResponse.json({ event: row }, { status: 201 });
}
