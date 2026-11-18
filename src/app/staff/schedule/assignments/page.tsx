import { BuilderShell, builderPage } from "../builder-shell";
import { TeachingAssignments } from "../../../teaching-assignments-ui";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ programId?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const back = query.returnTo?.startsWith("/staff/schedule/builder?")
    ? query.returnTo
    : "/staff/schedule/builder";
  return (
    <BuilderShell title="Дисциплины и группы">
      <TeachingAssignments
        catalog={await builderPage()}
        initialProgram={query.programId}
        back={back}
      />
    </BuilderShell>
  );
}
