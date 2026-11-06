import { AppNav } from "../app-nav";
import Link from "next/link";
import { protectedPage } from "@/server/page";
import { staffRequestPage, staffMemberPage } from "@/server/lists";
import { listCursor } from "@/lib/pagination";
import { universityDate } from "@/lib/time";
import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { db } from "@/server/db";
import { ActionForm, MembershipForm, Logout, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    pendingAfter?: string | string[];
    membersAfter?: string | string[];
  }>;
}) {
  const a = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return a;
  });
  const params = await searchParams;
  const pendingAfter = listCursor(params.pendingAfter),
    membersAfter = listCursor(params.membersAfter);
  const { queue, members, groups } = await protectedPage(async () => ({
    queue: await staffRequestPage(a, pendingAfter),
    members: await staffMemberPage(a, membersAfter),
    groups: await db.studentGroup.findMany({
      where: {
        active: true,
        program: {
          active: true,
          faculty: { active: true, universityId: a.membership.universityId },
        },
      },
      select: { id: true, name: true },
    }),
  }));
  const requests = queue.items;
  return (
    <main className="panel campus-shell">
      <AppNav role="STAFF" active="/staff" />
      <span id="workspace" tabIndex={-1} />
      <RefreshContext />
      <header>
        <h1>Очередь прикреплений</h1>
        <Logout />
      </header>
      <p>Конкурсный концепт, не официальный сервис</p>
      <p>
        Не вводите настоящие ФИО, email или личные пароли. Используйте только
        выданные демонстрационные данные.
      </p>
      {requests.length === 0 ? (
        <p>Ожидающих обращений нет.</p>
      ) : (
        requests.map((r) => (
          <section className="request" key={r.id} data-testid="pending-request">
            <h2>
              {r.membership.profile?.firstName} {r.membership.profile?.lastName}
            </h2>
            <p>Группа: {r.targetGroup.name}</p>
            <p>
              Подача:{" "}
              {universityDate(r.createdAt, a.membership.university.timezone)}
            </p>
            {(!r.targetGroup.active ||
              !r.targetGroup.program.active ||
              !r.targetGroup.program.faculty.active) && (
              <p>
                Группа недоступна: одобрение запрещено, запрос можно отклонить.
              </p>
            )}
            <ActionForm url="/api/staff/decision" requestId={r.id} />
          </section>
        ))
      )}
      <nav aria-label="Страницы очереди" className="flex gap-4">
        {pendingAfter && (
          <Link href="/staff" prefetch={false}>
            К началу очереди
          </Link>
        )}
        {queue.next && (
          <Link
            href={{ pathname: "/staff", query: { pendingAfter: queue.next } }}
            prefetch={false}
          >
            Следующие обращения
          </Link>
        )}
      </nav>
      <h2>Подтверждённые студенты</h2>
      {!members.items.length && <p>Подтверждённых студентов пока нет.</p>}
      {members.items.map((m) => {
        const current = m.enrollments[0];
        return (
          <section
            className="request"
            key={m.id}
            data-testid="student-membership"
          >
            <h3>
              {m.profile?.firstName} {m.profile?.lastName}
            </h3>
            <p>
              {current
                ? `Группа: ${current.group.name}`
                : "Прикрепление отозвано"}
            </p>
            <MembershipForm
              key={current?.id ?? String(m.resubmissionAllowed)}
              membershipId={m.id}
              enrollmentId={current?.id}
              allowed={m.resubmissionAllowed}
              groups={groups.filter((g) => g.id !== current?.groupId)}
            />
          </section>
        );
      })}
      <nav aria-label="Страницы студентов" className="flex gap-4">
        {membersAfter && (
          <Link href="/staff" prefetch={false}>
            К началу списка студентов
          </Link>
        )}
        {members.next && (
          <Link
            href={{ pathname: "/staff", query: { membersAfter: members.next } }}
            prefetch={false}
          >
            Следующие студенты
          </Link>
        )}
      </nav>
    </main>
  );
}
