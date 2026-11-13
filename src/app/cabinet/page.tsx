import { Workspace } from "../workspace";
import { AppNav } from "../app-nav";
import Link from "next/link";
import { protectedPage } from "@/server/page";
import { ownRequestPage } from "@/server/lists";
import { listCursor } from "@/lib/pagination";
import { universityDate } from "@/lib/time";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor } from "@/server/security";
import { db } from "@/server/db";
import { ActionForm, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const a = await protectedPage(() => headers().then(actor));
  if (a.membership.role === "STAFF") redirect("/staff");
  const after = listCursor((await searchParams).after);
  const history = await protectedPage(() => ownRequestPage(a, after));
  const m = a.membership;
  const enrollment = m.enrollments[0];
  const last = m.requests[0];
  const studyActive = !!(
    enrollment?.group.active &&
    enrollment.group.program.active &&
    enrollment.group.program.faculty.active
  );
  const status =
    m.status === "APPROVED" && !enrollment
      ? "Прикрепление отозвано"
      : m.status === "PENDING"
        ? "Ожидает подтверждения"
        : m.status === "REJECTED"
          ? "Отклонено"
          : m.status === "APPROVED" && studyActive
            ? "Подтверждено"
            : "Доступ закрыт";
  const groups = await protectedPage(() =>
    db.studentGroup.findMany({
      where: {
        active: true,
        program: {
          active: true,
          faculty: { active: true, universityId: m.universityId },
        },
      },
      select: { id: true, name: true },
    }),
  );
  const selected = last?.targetGroup;
  return (
    <main className="panel campus-shell">
      <AppNav
        role="STUDENT"
        active="/cabinet"
        canStudy={m.status === "APPROVED" && studyActive}
      />
      <Workspace>
        <RefreshContext />
        <div className="account-line">
          <span>Ваш профиль в Кампусе</span>
        </div>
        <header className="editorial-heading">
          <div>
            <p className="eyebrow">Мой кампус / Профиль</p>
            <h1>Личный кабинет</h1>
            <p>Учебная группа, прикрепление и история обращений.</p>
          </div>
        </header>
        <details className="demo-details">
          <summary>Только вымышленные данные</summary>
          <p>
            Не вводите настоящие ФИО, email или личные пароли. Используйте
            только выданные демонстрационные данные.
          </p>
        </details>
        <section className="profile-identity" aria-label="Прикрепление">
          <h2>{a.user.name}</h2>
          <p className="badge" data-testid="membership-status" role="status">
            {status}
          </p>
          <p>{m.university.name}</p>
          <p>
            Группа: {enrollment?.group.name ?? selected?.name ?? "Не назначена"}
          </p>
        </section>
        {m.status === "APPROVED" && studyActive ? (
          <p>
            Прикрепление подтверждено.{" "}
            <Link href="/today">Открыть главную</Link> или{" "}
            <Link href="/schedule">посмотреть расписание</Link>. Успеваемость и
            заявки доступны в навигации.
          </p>
        ) : (
          <p>
            Учебный доступ закрыт до действующего подтверждённого прикрепления.
          </p>
        )}
        {last?.reason && <p>Комментарий последнего обращения: {last.reason}</p>}
        {(m.status === "REJECTED" ||
          (m.status === "APPROVED" && m.resubmissionAllowed)) && (
          <section>
            <h2>Повторная подача</h2>
            <ActionForm url="/api/enrollment" groups={groups} />
          </section>
        )}
        <h2>История обращений</h2>
        <ul>
          {history.items.map((r) => (
            <li key={r.id}>
              {universityDate(r.createdAt, m.university.timezone)} —{" "}
              {
                {
                  PENDING: "Ожидает подтверждения",
                  APPROVED: "Подтверждено",
                  REJECTED: "Отклонено",
                }[r.status]
              }
            </li>
          ))}
        </ul>
        <nav aria-label="Страницы истории" className="flex gap-4">
          {after && (
            <Link href="/cabinet" prefetch={false}>
              К началу истории
            </Link>
          )}
          {history.next && (
            <Link
              href={{ pathname: "/cabinet", query: { after: history.next } }}
              prefetch={false}
            >
              Ранее
            </Link>
          )}
        </nav>
      </Workspace>
    </main>
  );
}
