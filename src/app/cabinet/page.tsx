import { Icon } from "../ui-icon";
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
  searchParams: Promise<{ after?: string | string[]; entry?: string }>;
}) {
  const a = await protectedPage(() => headers().then(actor));
  if (a.membership.role === "STAFF") redirect("/staff");
  const params = await searchParams;
  const after = listCursor(params.after);
  const history = await protectedPage(() => ownRequestPage(a, after));
  const m = a.membership;
  const enrollment = m.enrollments[0];
  const last = m.requests[0];
  const studyActive = !!(
    enrollment?.group.active &&
    enrollment.group.program.active &&
    enrollment.group.program.faculty.active
  );
  if (params.entry === "1")
    redirect(m.status === "APPROVED" && studyActive ? "/today" : "/cabinet");
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
    <main className="panel campus-shell student-profile">
      <AppNav
        role="STUDENT"
        active="/cabinet"
        canStudy={m.status === "APPROVED" && studyActive}
      />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <div>
            <p className="eyebrow">Мой кампус / Профиль</p>
            <h1>Профиль студента</h1>
            <p>Учебная группа, прикрепление и история обращений.</p>
          </div>
        </header>

        <section
          className="profile-identity"
          data-access={
            m.status === "APPROVED" && studyActive ? "active" : "closed"
          }
          aria-label="Прикрепление"
        >
          <span className="profile-avatar" aria-hidden="true">
            {a.user.name
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </span>
          <div>
            <h2>{a.user.name}</h2>
            <p
              className="badge"
              data-testid="membership-status"
              data-status={m.status}
              role="status"
            >
              {status}
            </p>
            <p>{m.university.name}</p>
          </div>
        </section>
        <div className="profile-grid">
          <section className="paper-card profile-data">
            <h2>Мои данные</h2>
            <dl>
              <div>
                <dt>ФИО</dt>
                <dd>{a.user.name}</dd>
              </div>
              <div>
                <dt>Университет</dt>
                <dd>{m.university.name}</dd>
              </div>
              <div>
                <dt>Факультет</dt>
                <dd>
                  {enrollment?.group.program.faculty.name ??
                    "После подтверждения прикрепления"}
                </dd>
              </div>
              <div>
                <dt>Направление</dt>
                <dd>
                  {enrollment?.group.program.name ??
                    "После подтверждения прикрепления"}
                </dd>
              </div>
              <div>
                <dt>Группа</dt>
                <dd data-testid="profile-group">
                  {enrollment?.group.name ?? selected?.name ?? "Не назначена"}
                </dd>
              </div>
              <div>
                <dt>Эл. почта</dt>
                <dd>{a.user.email}</dd>
              </div>
            </dl>
          </section>
          <section
            className="paper-card profile-access"
            data-access={
              m.status === "APPROVED" && studyActive ? "active" : "closed"
            }
            data-status={m.status}
          >
            <h2>Прикрепление</h2>
            <p className="profile-status">
              <Icon
                name={studyActive && m.status === "APPROVED" ? "check" : "user"}
              />
              {status}
            </p>
            <p>
              {m.status === "APPROVED" && studyActive
                ? "Вы закреплены за учебной группой. Расписание и учебные результаты доступны в вашем Кампусе."
                : "Учебный доступ закрыт до действующего подтверждённого прикрепления."}
            </p>
            <p className="profile-hint">
              История сохраняется при переводе. Актуальный доступ определяется
              вашим прикреплением.
            </p>
          </section>
        </div>
        {last?.reason && <p>Комментарий последнего обращения: {last.reason}</p>}
        {(m.status === "REJECTED" ||
          (m.status === "APPROVED" && m.resubmissionAllowed)) && (
          <section>
            <h2>Повторная подача</h2>
            <ActionForm url="/api/enrollment" groups={groups} />
          </section>
        )}
        <div className="profile-grid profile-bottom">
          <section className="paper-card profile-history">
            <h2>История прикрепления</h2>
            <ul className="profile-timeline">
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
                  href={{
                    pathname: "/cabinet",
                    query: { after: history.next },
                  }}
                  prefetch={false}
                >
                  Ранее
                </Link>
              )}
            </nav>
          </section>
          <aside className="paper-card profile-links">
            <h2>Быстрые переходы</h2>
            {m.status === "APPROVED" && studyActive && (
              <>
                <Link href="/today">
                  <Icon name="home" />
                  Открыть главную
                  <Icon name="arrow" />
                </Link>
                <Link href="/schedule">
                  <Icon name="calendar" />
                  Посмотреть расписание
                  <Icon name="arrow" />
                </Link>
                <Link href="/applications">
                  <Icon name="document" />
                  Мои заявки и справки
                  <Icon name="arrow" />
                </Link>
              </>
            )}
            <Link href="/notifications">
              <Icon name="document" />
              Уведомления
              <Icon name="arrow" />
            </Link>
            <p className="profile-hint">
              Обращения и готовые справки доступны в разделе «Заявки» при
              действующем учебном доступе.
            </p>
          </aside>
        </div>
        <details className="demo-details">
          <summary>Только вымышленные данные</summary>
          <p>
            Не вводите настоящие ФИО, email или личные пароли. Используйте
            только выданные демонстрационные данные.
          </p>
        </details>
      </Workspace>
    </main>
  );
}
