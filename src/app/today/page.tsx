import { HomeOverview } from "../home-overview";
import { readGrades } from "@/server/grades";
import { listApplications } from "@/server/applications";
import { Workspace } from "../workspace";
import { headers } from "next/headers";
import { actor, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { ScheduleView } from "../schedule-view";
import { RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { name, grades, applications } = await protectedPage(async () => {
    const a = await actor(await headers());
    studentAccess(a);
    const [grades, applications] = await Promise.all([
      readGrades(a),
      listApplications(a),
    ]);
    return { name: a.user.name, grades, applications };
  });
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/today" />
      <Workspace>
        <div>
          <RefreshContext />
          <ScheduleView
            home
            name={name}
            overview={
              <HomeOverview grades={grades} applications={applications} />
            }
          />
        </div>
      </Workspace>
    </main>
  );
}
