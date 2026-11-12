import { BuilderShell, builderPage } from "../builder-shell";
import { ScheduleBuilder } from "../../../semester-ui";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    semesterId?: string;
    programId?: string;
    day?: string;
  }>;
}) {
  const query = await searchParams;
  const catalog = await builderPage();
  return (
    <BuilderShell title="Конструктор расписания">
      <ScheduleBuilder
        catalog={catalog}
        initialSemester={query.semesterId}
        initialProgram={query.programId}
        initialDay={
          query.day ??
          catalog.semesters.find((s) => s.id === query.semesterId)?.calendar
            .start
        }
      />
    </BuilderShell>
  );
}
