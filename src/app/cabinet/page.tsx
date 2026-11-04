import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor } from "@/server/security";
import { db } from "@/server/db";
import { ActionForm, Logout, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  let a;
  try {
    a = await actor(await headers());
  } catch {
    redirect("/login");
  }
  if (a.membership.role === "STAFF") redirect("/staff");
  const m = a.membership;
  const enrollment = m.enrollments[0];
  const last = m.requests[0];
  const status =
    m.status === "APPROVED" && !enrollment
      ? "Прикрепление отозвано"
      : m.status === "PENDING"
        ? "Ожидает подтверждения"
        : m.status === "REJECTED"
          ? "Отклонено"
          : m.status === "APPROVED" && enrollment?.group.active
            ? "Подтверждено"
            : "Доступ закрыт";
  const groups = await db.studentGroup.findMany({
    where: {
      active: true,
      program: { faculty: { universityId: m.universityId } },
    },
    select: { id: true, name: true },
  });
  const selected = last?.targetGroup;
  return (
    <main className="panel">
      <RefreshContext />
      <header>
        <h1>Личный кабинет</h1>
        <Logout />
      </header>
      <p>Концепт, не официальный сервис</p>
      <h2>{a.user.name}</h2>
      <p data-testid="membership-status" role="status">
        {status}
      </p>
      <p>{m.university.name}</p>
      <p>
        Группа: {enrollment?.group.name ?? selected?.name ?? "Не назначена"}
      </p>
      {m.status === "APPROVED" && enrollment?.group.active ? (
        <p>
          Прикрепление подтверждено. Расписание, оценки и учебные заявки
          появятся на следующих этапах.
        </p>
      ) : (
        <p>
          Учебный доступ закрыт до действующего подтверждённого прикрепления.
        </p>
      )}
      {last?.reason && <p>Комментарий сотрудника: {last.reason}</p>}
      {(m.status === "REJECTED" || (m.status === "APPROVED" && m.resubmissionAllowed)) && (
        <section>
          <h2>Повторная подача</h2>
          <ActionForm url="/api/enrollment" groups={groups} />
        </section>
      )}
      <h2>История обращений</h2>
      <ul>
        {m.requests.map((r) => (
          <li key={r.id}>
            {r.createdAt.toLocaleDateString("ru-RU", {
              timeZone: m.university.timezone,
            })}{" "}
            — {r.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
