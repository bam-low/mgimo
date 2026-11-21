import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffExams, sessionCatalog } from "@/server/session";
import { staffStructure } from "@/server/structure";
import { examKindLabel } from "@/lib/session";
import { shortDate } from "@/lib/deadlines";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { StaffGradeTabs } from "../../staff-grade-tabs";
import { ExamCreate, ExamActions } from "../../session-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { exams, catalog, groups } = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    const [exams, catalog, tree] = await Promise.all([
      staffExams(a),
      sessionCatalog(a),
      staffStructure(a.membership.universityId),
    ]);
    return {
      exams,
      catalog,
      groups: tree.flatMap((f) =>
        f.active
          ? f.programs.flatMap((p) =>
              p.active
                ? p.groups
                    .filter((g) => g.active)
                    .map((g) => ({ id: g.id, name: g.name, context: p.name }))
                : [],
            )
          : [],
      ),
    };
  });
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/grades" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат</p>
          <h1>Успеваемость</h1>
          <p>Экзамены, зачёты и консультации. Пересечения проверяются сразу.</p>
        </header>
        <StaffGradeTabs active="session" />
        <ExamCreate catalog={catalog} groups={groups} today={exams.today} />
        {exams.items.length ? (
          <ul className="exam-list">
            {exams.items.map((e) => (
              <li
                key={e.id}
                className="exam-card"
                data-status={e.status}
                data-past={e.past ? "" : undefined}
                data-testid="staff-exam"
              >
                <div className="exam-date">
                  <strong>{shortDate(e.day)}</strong>
                  <span>
                    {e.startTime}–{e.endTime}
                  </span>
                </div>
                <div className="exam-body">
                  <span className="lesson-flags">
                    <span className="flag flag-exam">
                      {examKindLabel(e.kind)}
                    </span>
                    {e.movedFromStartsAt && e.status === "SCHEDULED" && (
                      <span className="flag flag-moved">Перенесено</span>
                    )}
                    {e.status === "CANCELLED" && (
                      <span className="flag">Отменено</span>
                    )}
                  </span>
                  <h3>{e.title}</h3>
                  <p>
                    {e.groups.map((g) => g.name).join(", ")} · {e.roomName} ·{" "}
                    {e.teacherName}
                  </p>
                  {e.status === "SCHEDULED" && !e.past && (
                    <ExamActions exam={e} catalog={catalog} today={exams.today} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">Сессия пока не назначена.</p>
        )}
      </Workspace>
    </main>
  );
}
