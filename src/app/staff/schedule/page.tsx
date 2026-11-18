import Link from "next/link";
import { BuilderShell, builderPage } from "./builder-shell";
import { ScheduleBuilder, Resources } from "../../semester-ui";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    semesterId?: string;
    programId?: string;
    day?: string;
    groupId?: string;
    draft?: string;
  }>;
}) {
  const query = await searchParams;
  const catalog = await builderPage();
  const programId =
    query.programId ??
    catalog.faculties
      .flatMap((f) => f.programs)
      .find((p) => p.groups.some((g) => g.id === query.groupId))?.id;
  return (
    <BuilderShell unified title="Расписание занятий">
      <ScheduleBuilder
        workspace
        catalog={catalog}
        initialGroup={query.groupId}
        initialDraft={query.draft}
        initialSemester={query.semesterId}
        initialProgram={programId}
        initialDay={
          query.day ??
          catalog.semesters.find((s) => s.id === query.semesterId)?.calendar
            .start
        }
      />
      <details id="schedule-resources" className="editor-panel">
        <summary>Преподаватели и аудитории</summary>
        <Resources catalog={catalog} />
        <p>
          <a href="#builder-filters">Вернуться к расписанию →</a>
        </p>
      </details>
      <p>
        <Link href="/staff/schedule/manual">Демо · ручное расписание →</Link>
      </p>
    </BuilderShell>
  );
}
