import Link from "next/link";
import type { readGrades } from "@/server/grades";
import type { listApplications } from "@/server/applications";
import { resultLabel } from "@/lib/grade-display";
import { statusLabel } from "@/lib/applications";
import { displayDate } from "./schedule-input-values";
import { Icon } from "./ui-icon";

/** Recent, scoped records — deliberately no invented GPA or incomplete totals. */
export function HomeOverview({
  grades,
  applications,
}: {
  grades: Awaited<ReturnType<typeof readGrades>>;
  applications: Awaited<ReturnType<typeof listApplications>>;
}) {
  return (
    <div className="home-overview">
      <section
        className="paper-card overview-grades"
        aria-label="Последние результаты"
      >
        <header className="overview-heading">
          <h2>
            <Icon name="book" /> Успеваемость
          </h2>
        </header>
        {grades.rows.length ? (
          <>
            <p className="overview-value">{resultLabel(grades.rows[0])}</p>
            <p className="overview-caption">{grades.rows[0].subject.name}</p>
            <p className="footnote">
              Последний результат · {displayDate(grades.rows[0].issuedOn)}
            </p>
            <div className="overview-more">
              {grades.rows.slice(1, 3).map((g) => (
                <p key={g.id}>
                  <span>{g.subject.name}</span>
                  <strong>{resultLabel(g)}</strong>
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="overview-empty">Здесь появятся ваши оценки и зачёты.</p>
        )}
        <Link className="overview-footer" href="/grades">
          Все результаты <Icon name="chevron" />
        </Link>
      </section>
      <section
        className="paper-card overview-applications"
        aria-label="Последние заявки"
      >
        <header className="overview-heading">
          <h2>
            <Icon name="document" /> Мои заявки
          </h2>
        </header>
        {applications.rows.length ? (
          <div className="overview-recent-apps">
            {applications.rows.slice(0, 2).map((app) => (
              <Link key={app.id} href={`/applications/${app.id}`}>
                <span className="badge" data-status={app.status}>
                  {statusLabel[app.status as keyof typeof statusLabel]}
                </span>
                <strong>{app.subject}</strong>
                {app.currentDocument && <small>Документ сохранён</small>}
              </Link>
            ))}
          </div>
        ) : (
          <p className="overview-empty">
            Пока нет обращений. Деканат рядом, когда понадобится.
          </p>
        )}
        <Link className="overview-footer" href="/applications">
          Открыть заявки <Icon name="chevron" />
        </Link>
      </section>
      <section
        className="paper-card quick-links home-quick-links"
        aria-label="Быстрые действия"
      >
        <p className="eyebrow">Быстрые действия</p>
        <Link href="/applications#new-application">
          <span className="link-icon">
            <Icon name="document" />
          </span>
          <span>
            <strong>Заказать справку или подать заявку</strong>
            <small>Напрямую в ваш деканат</small>
          </span>
          <Icon name="chevron" />
        </Link>
      </section>
      <section className="home-note">
        <Icon name="building" />
        <div>
          <h2>Ваш деканат — рядом</h2>
          <p>
            Ответы на обращения и готовые демонстрационные справки сохраняются в
            разделе «Заявки».
          </p>
        </div>
      </section>
    </div>
  );
}
