import { HomeOverview } from "../home-overview";
import { readGrades } from "@/server/grades";
import { listApplications } from "@/server/applications";
import { studentAnnouncements } from "@/server/announcements";
import { nextExam } from "@/server/session";
import { studentDeadlines } from "@/server/deadlines";
import { HomeAnnouncements } from "../home-announcements";
import { HomeUpcoming } from "../home-upcoming";
import { Workspace } from "../workspace";
import { headers } from "next/headers";
import { actor, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { ScheduleView } from "../schedule-view";
import { RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { name, grades, applications, study, notices, exam, deadlines } =
    await protectedPage(async () => {
      const a = await actor(await headers());
      const enrollment = studentAccess(a);
      const [grades, applications, notices, exam, deadlines] =
        await Promise.all([
          readGrades(a),
          listApplications(a),
          studentAnnouncements(a, { take: 2, unreadOnly: true }),
          nextExam(a),
          studentDeadlines(a),
        ]);
      return {
        name: a.user.name,
        grades,
        applications,
        notices,
        exam,
        deadlines,
        study: {
          faculty: enrollment.group.program.faculty.name,
          program: enrollment.group.program.name,
          group: enrollment.group.name,
        },
      };
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
            study={study}
            notice={
              <>
                <HomeUpcoming
                  exam={exam}
                  deadlines={deadlines.active}
                  now={deadlines.serverNow}
                  today={deadlines.today}
                />
                <HomeAnnouncements
                  items={notices.items}
                  total={notices.total}
                  timezone={notices.timezone}
                />
              </>
            }
            overview={
              <HomeOverview grades={grades} applications={applications} />
            }
          />
        </div>
      </Workspace>
    </main>
  );
}
