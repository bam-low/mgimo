import Link from "next/link";
import { ApplicationShell, applicationPageActor } from "./shared";
import { listApplications } from "@/server/applications";
import { protectedPage } from "@/server/page";
import { kindLabel, statusLabel } from "@/lib/applications";
import { ApplicationForm } from "../application-forms";
import { ScheduleField } from "../schedule-field";
export async function ApplicationList({
  isStaff,
  query,
}: {
  isStaff: boolean;
  query: Record<string, string | undefined>;
}) {
  const a = await applicationPageActor(isStaff),
    q = Object.fromEntries(Object.entries(query).filter(([, v]) => v)),
    data = await protectedPage(() => listApplications(a, q)),
    base = isStaff ? "/staff/applications" : "/applications";
  return (
    <ApplicationShell isStaff={isStaff}>
      {!isStaff && (
        <Link className="compose-jump card-action" href="#new-application">
          Создать обращение или заказать справку
        </Link>
      )}
      <details
        className="filters-disclosure"
        open={isStaff || Object.keys(q).some((k) => k !== "cursor")}
      >
        <summary>
          Фильтры{" "}
          <small>
            {[
              q.kind && kindLabel[q.kind as keyof typeof kindLabel],
              q.status && statusLabel[q.status as keyof typeof statusLabel],
            ]
              .filter(Boolean)
              .join(" · ") || "все заявки"}
          </small>
        </summary>
      <form
        action={base}
        className="application-filters"
        aria-label="Фильтры заявок"
      >
        <div>
          <label htmlFor="application-filter-kind">Тип заявки</label>
          <select
            id="application-filter-kind"
            name="kind"
            defaultValue={query.kind ?? ""}
          >
            <option value="">Все типы</option>
            {Object.entries(kindLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="application-filter-status">Статус</label>
          <select
            id="application-filter-status"
            name="status"
            defaultValue={query.status ?? ""}
          >
            <option value="">Все статусы</option>
            {Object.entries(statusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {isStaff && (
          <>
            <ScheduleField
              broad
              label="Создана с даты"
              name="from"
              defaultValue={query.from ?? ""}
            />
            <ScheduleField
              broad
              label="Создана по дату"
              name="to"
              defaultValue={query.to ?? ""}
            />
          </>
        )}
        <button className="secondary">Применить фильтры</button>
        <Link href={base}>Сбросить фильтры</Link>
      </form>
      </details>
      <section aria-label="Список заявок">
        <h2>{isStaff ? "Поступившие обращения" : "Мои заявки"}</h2>
        <p className="footnote">
          На странице: {data.rows.length}. Даты показаны в {data.timezone}.
        </p>
        {!data.rows.length && (
          <p className="notice">
            {Object.values(q).length
              ? "По выбранным фильтрам заявок нет. Попробуйте изменить условия."
              : isStaff
                ? "Новых обращений пока нет."
                : "Заявок пока нет. Создайте первое обращение или закажите демонстрационную справку."}
          </p>
        )}
        <div className="application-list">
          {data.rows.map((app) => (
            <article
              className="application-card"
              data-testid="application-row"
              key={app.id}
            >
              <span className="badge" data-status={app.status}>
                {statusLabel[app.status as keyof typeof statusLabel]}
              </span>
              <p className="eyebrow">
                {kindLabel[app.kind as keyof typeof kindLabel]}
              </p>
              <h3>
                <Link href={`${base}/${app.id}`}>{app.subject}</Link>
              </h3>
              <p>
                {new Intl.DateTimeFormat("ru-RU", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: data.timezone,
                }).format(app.createdAt)}
              </p>
              <p className="footnote">При подаче: {app.submittedGroupName}</p>
              {app.currentDocument && (
                <p>Документ сохранён · версия {app.currentDocument.revision}</p>
              )}
              <Link href={`${base}/${app.id}`}>Открыть заявку</Link>
            </article>
          ))}
        </div>
        {data.next && (
          <Link href={{ pathname: base, query: { ...q, cursor: data.next } }}>
            Следующие заявки
          </Link>
        )}
      </section>
      {!isStaff && <ApplicationForm />}
    </ApplicationShell>
  );
}
