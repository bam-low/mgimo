import { ScheduleManagement } from "../../schedule-management";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { builderCatalog } from "@/server/semester-builder";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
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
}: {
  title: string;
  children: ReactNode;
  /** Единый экран: якорные кнопки не нужны, выбор способа — в самом экране. */
  unified?: boolean;
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
        {!unified && <ScheduleManagement />}

        {children}
      </Workspace>
    </main>
  );
}
