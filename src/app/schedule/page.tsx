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
  searchParams: Promise<{ view?: string }>;
}) {
  const initialView = (await searchParams).view === "week" ? "week" : "today";
  await protectedPage(async () => studentAccess(await actor(await headers())));
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/schedule" />
      <Workspace>
        <RefreshContext />
        <ScheduleView key={initialView} initialView={initialView} />
      </Workspace>
    </main>
  );
}
