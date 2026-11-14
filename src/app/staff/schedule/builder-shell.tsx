import Link from "next/link";
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
}: {
  title: string;
  children: ReactNode;
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
        <nav className="semester-links" aria-label="Управление расписанием">
          <Link href="/staff/schedule/semesters">Учебные семестры</Link>
          <Link href="/staff/schedule/builder">Конструктор</Link>
          <Link href="/staff/schedule/resources">
            Преподаватели и аудитории
          </Link>
          <Link href="/staff/structure">Управлять группами</Link>
          <Link href="/staff/schedule">Прежнее расписание</Link>
        </nav>
        {children}
      </Workspace>
    </main>
  );
}
