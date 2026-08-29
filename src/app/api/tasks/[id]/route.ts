import { NextResponse } from "next/server";
import { requireUser, zodBadRequest, notFound } from "../../../../lib/api.js";
import { taskUpdateSchema } from "../../../../lib/validation.js";
import { updateTask, deleteTask } from "../../../../lib/repos/tasks.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  const row = await updateTask(auth.db, auth.user.id, id, parsed.data);
  if (!row) return notFound("task");
  return NextResponse.json({ task: row });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const ok = await deleteTask(auth.db, auth.user.id, id);
  if (!ok) return notFound("task");
  return NextResponse.json({ ok: true });
}
