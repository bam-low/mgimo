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
      <p>Концепт, не официальный сервис</p>
      {requests.length === 0 ? (
        <p>Ожидающих обращений нет.</p>
      ) : (
        requests.map((r) => (
          <section className="request" key={r.id}>
            <h2>
              {r.membership.profile?.firstName} {r.membership.profile?.lastName}
            </h2>
            <p>Группа: {r.targetGroup.name}</p>
            <ActionForm url="/api/staff/decision" requestId={r.id} />
          </section>
        ))
      )}
    </main>
  );
}
