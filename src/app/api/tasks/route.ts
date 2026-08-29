import { NextResponse } from "next/server";
import { requireUser, zodBadRequest } from "../../../lib/api.js";
import { taskCreateSchema } from "../../../lib/validation.js";
import { listTasks, createTask } from "../../../lib/repos/tasks.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rows = await listTasks(auth.db, auth.user.id);
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  const row = await createTask(auth.db, auth.user.id, parsed.data);
  return NextResponse.json({ task: row }, { status: 201 });
}
