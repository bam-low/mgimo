import { headers } from "next/headers";
import { actor, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { ScheduleView } from "../schedule-view";
import { Logout, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  await protectedPage(async () => studentAccess(await actor(await headers())));
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/schedule" />
      <div className="account-line">
        <p>Ваше групповое расписание</p>
        <div className="logout-control">
          <Logout />
        </div>
      </div>
      <span id="workspace" tabIndex={-1} />
      <RefreshContext />
      <ScheduleView />
    </main>
  );
}
