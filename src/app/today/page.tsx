import { headers } from "next/headers";
import { actor, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { ScheduleView } from "../schedule-view";
import { Logout, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const name = await protectedPage(async () => {
    const a = await actor(await headers());
    studentAccess(a);
    return a.user.name;
  });
  return (
    <main className="campus-shell">
      <a className="skip-link" href="#day">
        К расписанию
      </a>
      <AppNav role="STUDENT" active="/today" />
      <div className="account-line">
        <p>Добро пожаловать, {name}</p>
        <div className="logout-control">
          <Logout />
        </div>
      </div>
      <div id="day">
        <RefreshContext />
        <ScheduleView home />
      </div>
    </main>
  );
}
