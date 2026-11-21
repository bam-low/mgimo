import { Workspace } from "../workspace";
import { headers } from "next/headers";
import { actor, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { ScheduleView } from "../schedule-view";
import { RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; day?: string }>;
}) {
  const query = await searchParams;
  const initialView = query.view === "week" ? "week" : "today";
  // Links from notifications open a specific day (?day=YYYY-MM-DD); anything else is ignored.
  const initialDay =
    query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) &&
    !Number.isNaN(Date.parse(query.day + "T00:00:00Z"))
      ? query.day
      : "";
  await protectedPage(async () => studentAccess(await actor(await headers())));
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/schedule" />
      <Workspace>
        <RefreshContext />
        <ScheduleView
          key={`${initialView}:${initialDay}`}
          initialView={initialView}
          initialDay={initialDay}
        />
      </Workspace>
    </main>
  );
}
