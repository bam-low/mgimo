import Link from "next/link";
import { BuilderShell, builderPage } from "./builder-shell";
import { ScheduleBuilder, Resources, BackToBuilder } from "../../semester-ui";
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
  // Only an explicit choice (kept in the address) selects a semester: the
  // semester editor shares this state, and a silent preselect would turn
  // "create semester" into editing the existing one.
  const semesterId = query.semesterId;
  return (
    <BuilderShell unified method="builder" title="Расписание занятий">
      <ScheduleBuilder
        workspace
        catalog={catalog}
        initialGroup={query.groupId}
        initialDraft={query.draft}
        initialSemester={semesterId}
        initialProgram={programId}
        initialDay={
          query.day ??
          catalog.semesters.find((s) => s.id === semesterId)?.calendar.start
        }
      />
      <details id="schedule-resources" className="editor-panel">
        <summary>Преподаватели и аудитории</summary>
        <Resources catalog={catalog} />
        <p>
          <BackToBuilder />
        </p>
      </details>
      <p>
        <Link href="/staff/schedule/manual">Демо · ручное расписание →</Link>
      </p>
    </BuilderShell>
  );
}
