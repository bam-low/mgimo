import { BuilderShell, builderPage } from "../builder-shell";
import { Resources } from "../../../semester-ui";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <BuilderShell title="Преподаватели и аудитории">
      <Resources catalog={await builderPage()} />
    </BuilderShell>
  );
}
