import type { ReactNode } from "react";
import { headers } from "next/headers";
import { actor, staff, studentAccess } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
export async function applicationPageActor(isStaff: boolean) {
  return protectedPage(async () => {
    const a = await actor(await headers());
    if (isStaff) staff(a);
    else studentAccess(a);
    return a;
  });
}
export function ApplicationShell({
  isStaff,
  children,
}: {
  isStaff: boolean;
  children: ReactNode;
}) {
  return (
    <main className="campus-shell">
      <AppNav
        role={isStaff ? "STAFF" : "STUDENT"}
        active={isStaff ? "/staff/applications" : "/applications"}
      />
      <Workspace>
        <div className="account-line">
          <span>
            {isStaff
              ? "Рабочее пространство сотрудника"
              : "Ваши обращения в деканат"}
          </span>
        </div>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Заявки</p>
          <h1>{isStaff ? "Обработка заявок" : "Заявки и справки"}</h1>
          <p>
            Только вымышленные данные · Образцы не являются официальными
            документами
          </p>
        </header>
        {children}
      </Workspace>
    </main>
  );
}
