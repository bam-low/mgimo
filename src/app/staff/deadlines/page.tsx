import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffStructure } from "@/server/structure";
import { staffDeadlines } from "@/server/deadlines";
import { shortDate } from "@/lib/deadlines";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { StaffNewsTabs } from "../../staff-news-tabs";
import { DeadlineForm, DeleteDeadline } from "../../deadline-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { tree, data } = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    const [tree, data] = await Promise.all([
      staffStructure(a.membership.universityId),
      staffDeadlines(a),
    ]);
    return { tree, data };
  });
  const now = Date.now();
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/announcements" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Дедлайны</p>
          <h1>Дедлайны</h1>
          <p>
            Студенты видят срок на главной и получают напоминание за 48 часов.
          </p>
        </header>
        <StaffNewsTabs active="deadlines" />
        <div className="announcements-layout">
          <DeadlineForm tree={tree} today={data.today} />
          <section aria-labelledby="active-deadlines">
            <h2 id="active-deadlines" className="section-heading">
              Опубликованные
            </h2>
            {data.items.length ? (
              <ul className="deadline-list is-staff">
                {data.items.map((d) => (
                  <li
                    key={d.id}
                    className="deadline-row"
                    data-past={Date.parse(d.dueAt) <= now ? "" : undefined}
                    data-testid="staff-deadline"
                  >
                    <div className="deadline-main">
                      <strong>{d.title}</strong>
                      {d.body && <p>{d.body}</p>}
                      <span className="deadline-when">
                        до {shortDate(d.day)}, {d.time} · {d.audience}
                      </span>
                    </div>
                    {Date.parse(d.dueAt) > now && (
                      <DeleteDeadline id={d.id} title={d.title} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">Дедлайнов пока нет.</p>
            )}
          </section>
        </div>
      </Workspace>
    </main>
  );
}
