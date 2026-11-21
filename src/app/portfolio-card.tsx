import type { ReactNode } from "react";
import {
  portfolioActivities,
  portfolioCategories,
  portfolioEventTypes,
  portfolioFormats,
  portfolioLevels,
  portfolioOrganizerTypes,
  portfolioParticipants,
  portfolioStatuses,
  type PortfolioStatus,
} from "@/lib/portfolio";
import { Icon } from "./ui-icon";

export type PortfolioCardItem = {
  id: string;
  status: PortfolioStatus;
  category: string;
  activity: string;
  eventDate: string;
  title: string;
  comment: string | null;
  format: string;
  eventType: string;
  rulesUrl: string | null;
  participants: string;
  eventUrl: string | null;
  level: string;
  organizers: { type: string; name: string }[];
  byteSize: number;
  reviewComment: string | null;
  reviewedAt: Date | string | null;
  submittedAt: Date | string | null;
  version: number;
  student?: { id: string; name: string; group: string };
};

const label = (map: Record<string, string>, key: string) => map[key] ?? key;
const civilDate = (v: string) => v.split("-").reverse().join(".");
export function portfolioMoment(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** Только http(s): ссылки из формы не могут стать javascript:-ссылками. */
function SafeLink({ href }: { href: string }) {
  let ok: boolean;
  try {
    ok = ["http:", "https:"].includes(new URL(href).protocol);
  } catch {
    ok = false;
  }
  if (!ok) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {href}
    </a>
  );
}

/** Карточка работы портфолио: главное сверху, подробности — по нажатию. */
export function PortfolioCard({
  item,
  timezone,
  actions,
}: {
  item: PortfolioCardItem;
  timezone: string;
  actions?: ReactNode;
}) {
  const status = portfolioStatuses[item.status];
  return (
    <article
      className="portfolio-card"
      data-status={item.status}
      data-testid="portfolio-item"
    >
      <div className="portfolio-card-top">
        <span className="portfolio-status" data-status={item.status}>
          {item.status === "APPROVED" && <Icon name="check" />}
          {status}
        </span>
        <span className="portfolio-date">{civilDate(item.eventDate)}</span>
      </div>
      <h3>{item.title}</h3>
      {item.student && (
        <p className="portfolio-student">
          {item.student.name} · {item.student.group}
        </p>
      )}
      <p className="portfolio-meta">
        {label(portfolioCategories, item.category)} ·{" "}
        {label(portfolioActivities, item.activity)}
      </p>
      {item.status === "PRIVATE" && (
        <p className="portfolio-note">
          Видна только вам. Деканат не видит и не учитывает эту работу.
        </p>
      )}
      {item.status === "PENDING" && item.submittedAt && (
        <p className="portfolio-note">
          Отправлено {portfolioMoment(item.submittedAt, timezone)}. Ожидает
          решения деканата.
        </p>
      )}
      {(item.status === "APPROVED" || item.status === "REJECTED") && (
        <div className="portfolio-review" data-status={item.status}>
          <strong>
            {item.status === "APPROVED"
              ? "Подтверждено деканатом"
              : "Отклонено деканатом"}
            {item.reviewedAt &&
              ` · ${portfolioMoment(item.reviewedAt, timezone)}`}
          </strong>
          {item.reviewComment && <p>Комментарий: {item.reviewComment}</p>}
        </div>
      )}
      <details className="portfolio-details">
        <summary>Сведения о мероприятии</summary>
        <dl>
          <div>
            <dt>Тип мероприятия</dt>
            <dd>{label(portfolioEventTypes, item.eventType)}</dd>
          </div>
          <div>
            <dt>Формат</dt>
            <dd>{label(portfolioFormats, item.format)}</dd>
          </div>
          <div>
            <dt>Статус мероприятия</dt>
            <dd>{label(portfolioLevels, item.level)}</dd>
          </div>
          <div>
            <dt>Численность участников</dt>
            <dd>{label(portfolioParticipants, item.participants)}</dd>
          </div>
          {item.organizers.length > 0 && (
            <div>
              <dt>Организаторы</dt>
              <dd>
                {item.organizers.map((o, i) => (
                  <span key={i} className="portfolio-organizer">
                    {o.name} ({label(portfolioOrganizerTypes, o.type)})
                  </span>
                ))}
              </dd>
            </div>
          )}
          {item.rulesUrl && (
            <div>
              <dt>Правила</dt>
              <dd>
                <SafeLink href={item.rulesUrl} />
              </dd>
            </div>
          )}
          {item.eventUrl && (
            <div>
              <dt>Мероприятие</dt>
              <dd>
                <SafeLink href={item.eventUrl} />
              </dd>
            </div>
          )}
          {item.comment && (
            <div>
              <dt>Комментарий студента</dt>
              <dd>{item.comment}</dd>
            </div>
          )}
        </dl>
      </details>
      <div className="portfolio-actions">
        <a
          className="portfolio-file"
          href={`/api/portfolio/${encodeURIComponent(item.id)}/file`}
        >
          <Icon name="document" />
          PDF · {(item.byteSize / 1024).toFixed(0)} КБ
        </a>
        {actions}
      </div>
    </article>
  );
}
