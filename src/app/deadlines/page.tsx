import { headers } from "next/headers";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { studentDeadlines } from "@/server/deadlines";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
import { DeadlineRow } from "../deadline-items";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await protectedPage(async () =>
    studentDeadlines(await actor(await headers())),
  );
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/deadlines" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Учёба / Сроки</p>
          <h1>Дедлайны</h1>
          <p>Сроки от деканата. Отметка «Сделано» видна только вам.</p>
        </header>
        <section aria-labelledby="deadlines-active">
          <h2 id="deadlines-active" className="section-heading">
            Активные
          </h2>
          {data.active.length ? (
            <ul className="deadline-list">
              {data.active.map((d) => (
                <DeadlineRow
                  key={d.id}
                  item={d}
                  now={data.serverNow}
                  today={data.today}
                />
              ))}
            </ul>
          ) : (
            <p className="notice">Активных дедлайнов нет.</p>
          )}
        </section>
        {data.past.length > 0 && (
          <section aria-labelledby="deadlines-past" className="deadlines-past">
            <h2 id="deadlines-past" className="section-heading">
              Прошедшие
            </h2>
            <ul className="deadline-list">
              {data.past.map((d) => (
                <DeadlineRow
                  key={d.id}
                  item={d}
                  now={data.serverNow}
                  today={data.today}
                />
              ))}
            </ul>
          </section>
        )}
      </Workspace>
    </main>
  );
}
