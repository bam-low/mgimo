import { BuilderShell, builderPage } from "../builder-shell";
import { Semesters } from "../../../semester-ui";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <BuilderShell title="Учебные семестры">
      <Semesters catalog={await builderPage()} />
    </BuilderShell>
  );
}
