import { headers } from "next/headers";
import Link from "next/link";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import {
  staffPortfolioQueue,
  staffPortfolioStudents,
  staffStudentPortfolio,
  type StaffPortfolioItemView,
} from "@/server/portfolio";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { PortfolioCard } from "../../portfolio-card";
import { PortfolioDecision } from "../../portfolio-forms";
export const dynamic = "force-dynamic";

function Cards({
  items,
  timezone,
}: {
  items: StaffPortfolioItemView[];
  timezone: string;
}) {
  return (
    <div className="portfolio-list">
      {items.map((item) => (
        <PortfolioCard
          key={item.id}
          item={item}
          timezone={timezone}
          actions={
            item.status === "PENDING" ? (
              <PortfolioDecision id={item.id} version={item.version} />
            ) : undefined
          }
        />
      ))}
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; student?: string }>;
}) {
  const q = await searchParams;
  const byStudent = q.view === "students";
  const data = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    const queue = (await staffPortfolioQueue(a)).items;
    const students = byStudent ? await staffPortfolioStudents(a) : [];
    const selected = students.find((s) => s.id === q.student);
    return {
      timezone: a.membership.university.timezone,
      queue,
      students,
      selected,
      items: selected ? await staffStudentPortfolio(a, selected.id) : [],
    };
  });
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/portfolio" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Портфолио</p>
          <h1>Портфолио студентов</h1>
          <p>
            Подтверждённые достижения учитываются при переводе на бюджетное
            место и назначении повышенной стипендии. Работы «Только для вас»
            деканату не видны.
          </p>
        </header>
        <nav className="mode-tabs" aria-label="Режим портфолио">
          <Link
            href="/staff/portfolio"
            aria-current={byStudent ? undefined : "page"}
          >
            На модерации · {data.queue.length}
          </Link>
          <Link
            href="/staff/portfolio?view=students"
            aria-current={byStudent ? "page" : undefined}
          >
            Достижения студента
          </Link>
        </nav>
        {!byStudent ? (
          data.queue.length ? (
            <Cards items={data.queue} timezone={data.timezone} />
          ) : (
            <p className="notice">
              Новых работ на модерации нет. Когда студент отправит работу, она
              появится здесь.
            </p>
          )
        ) : (
          <>
            <form
              method="get"
              className="portfolio-student-picker"
              aria-label="Выбор студента"
            >
              <input type="hidden" name="view" value="students" />
              <label>
                Студент
                <select
                  name="student"
                  required
                  defaultValue={data.selected?.id ?? ""}
                >
                  <option value="" disabled>
                    Выберите студента
                  </option>
                  {data.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.group} · работ: {s.items}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">Показать</button>
            </form>
            {data.selected ? (
              data.items.length ? (
                <Cards items={data.items} timezone={data.timezone} />
              ) : (
                <p className="notice">
                  У студента нет работ, отправленных в деканат.
                </p>
              )
            ) : (
              <p className="notice">
                Выберите студента, чтобы посмотреть его достижения: на
                модерации, подтверждённые и отклонённые.
              </p>
            )}
          </>
        )}
      </Workspace>
    </main>
  );
}
