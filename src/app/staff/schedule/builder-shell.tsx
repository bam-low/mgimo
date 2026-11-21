import { ScheduleManagement } from "../../schedule-management";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { builderCatalog } from "@/server/semester-builder";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { ScheduleMethods } from "../../schedule-methods";
export async function builderPage() {
  const a = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return a;
  });
  return protectedPage(() => builderCatalog(a.membership.universityId));
}
export function BuilderShell({
  title,
  children,
  unified = false,
  method,
}: {
  title: string;
  children: ReactNode;
  unified?: boolean;
  /** Показать выбор «вручную / из таблицы». */
  method?: "builder" | "import";
}) {
  return (
    <main className="campus-shell staff-schedule-page">
      <AppNav role="STAFF" active="/staff/schedule" />
      <Workspace>
        <div className="account-line">
          <span>Рабочее пространство сотрудника</span>
        </div>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Семестровое расписание</p>
          <h1>{title}</h1>
          <p>Учебный календарь и занятия · Только вымышленные данные</p>
        </header>
        <ScheduleManagement
          unified={unified}
          base={method === "import" ? "/staff/schedule" : ""}
        />
        {method && <ScheduleMethods active={method} />}

        {children}
      </Workspace>
    </main>
  );
}
