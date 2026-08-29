import { NextResponse } from "next/server";
import { requireUser, zodBadRequest, notFound } from "../../../../lib/api.js";
import { eventUpdateSchema } from "../../../../lib/validation.js";
import { updateEvent, deleteEvent } from "../../../../lib/repos/events.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = eventUpdateSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  const row = await updateEvent(auth.db, auth.user.id, id, parsed.data);
  if (!row) return notFound("event");
  return NextResponse.json({ event: row });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const ok = await deleteEvent(auth.db, auth.user.id, id);
  if (!ok) return notFound("event");
  return NextResponse.json({ ok: true });
}
