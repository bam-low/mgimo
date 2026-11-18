import { NotificationRefresh } from "../notification-controls";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
export const notificationActor = () =>
  protectedPage(async () => actor(await headers()));
export function NotificationShell({
  children,
  canStudy,
}: {
  children: ReactNode;
  canStudy: boolean;
}) {
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/notifications" canStudy={canStudy} />
      <Workspace>
        <RefreshContext />
        <NotificationRefresh />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Личные события</p>
          <h1>Уведомления</h1>
          <p>Решения по прикреплению, обращениям и справкам, отмены занятий.</p>
        </header>
        {children}
      </Workspace>
    </main>
  );
}
export function notificationDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}
