import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor, staff } from "@/server/security";
import { db } from "@/server/db";
import { ActionForm, Logout, RefreshContext } from "../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  let a;
  try {
    a = await actor(await headers());
    staff(a);
  } catch {
    redirect("/login");
  }
  const requests = await db.enrollmentRequest.findMany({
    where: {
      status: "PENDING",
      membership: { universityId: a.membership.universityId },
    },
    include: { membership: { include: { profile: true } }, targetGroup: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    <main className="panel">
      <RefreshContext />
      <header>
        <h1>Очередь прикреплений</h1>
        <Logout />
      </header>
      <p>Конкурсный концепт, не официальный сервис</p>
      <p>Не вводите настоящие ФИО, email или личные пароли. Используйте только выданные демонстрационные данные.</p>
      {requests.length === 0 ? (
        <p>Ожидающих обращений нет.</p>
      ) : (
        requests.map((r) => (
          <section className="request" key={r.id}>
            <h2>
              {r.membership.profile?.firstName} {r.membership.profile?.lastName}
            </h2>
            <p>Группа: {r.targetGroup.name}</p>
              {!r.targetGroup.active && <p>Группа недоступна: одобрение запрещено, запрос можно отклонить.</p>}
            <ActionForm url="/api/staff/decision" requestId={r.id} />
          </section>
        ))
      )}
    </main>
  );
}
