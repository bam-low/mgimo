import type { ReactNode } from "react";

export type AnnouncementItem = {
  id: string;
  scope: string;
  audience: string;
  title: string;
  body: string;
  expiresAt: string | null;
  createdAt: string;
};

export function announcementDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** Карточки объявлений; у сотрудника рядом с каждой — кнопка удаления. */
export function AnnouncementList({
  items,
  timezone,
  empty,
  action,
}: {
  items: AnnouncementItem[];
  timezone: string;
  empty: string;
  action?: (item: AnnouncementItem) => ReactNode;
}) {
  if (!items.length) return <p className="notice">{empty}</p>;
  return (
    <ul className="announcement-list">
      {items.map((n) => (
        <li key={n.id}>
          <article
            className="announcement-card"
            aria-labelledby={`ann-${n.id}`}
          >
            <div className="announcement-meta">
              <span className="announcement-audience">{n.audience}</span>
              <time dateTime={n.createdAt}>
                {announcementDate(n.createdAt, timezone)}
              </time>
            </div>
            <h3 id={`ann-${n.id}`}>{n.title}</h3>
            <p className="announcement-body">{n.body}</p>
            <div className="announcement-foot">
              <span className="announcement-term">
                {n.expiresAt
                  ? `Действует до ${announcementDate(n.expiresAt, timezone)}`
                  : "Бессрочно"}
              </span>
              {action?.(n)}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
