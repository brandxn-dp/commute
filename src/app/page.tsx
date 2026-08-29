import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth/current.js";
import { getConfig } from "../config/env.js";
import { getDb } from "../db/index.js";
import { settings } from "../db/schema.js";
import CalendarApp from "../components/CalendarApp.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const config = getConfig();
  const db = getDb(config.DATABASE_URL);
  const settingsRow = await db.select().from(settings).limit(1);
  const timezone = settingsRow[0]?.timezone ?? config.DEFAULT_TIMEZONE;

  return <CalendarApp user={user} timezone={timezone} />;
}
