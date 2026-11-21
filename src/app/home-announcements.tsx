import Link from "next/link";
import { Icon } from "./ui-icon";
import { announcementDate, type AnnouncementItem } from "./announcement-list";

/** Свежие объявления на главной студента; на телефоне это вход в раздел. */
export function HomeAnnouncements({
  items,
  timezone,
}: {
  items: AnnouncementItem[];
  timezone: string;
}) {
  if (!items.length) return null;
  const shown = items.slice(0, 2);
  return (
    <section
      className="home-announcements"
      aria-labelledby="home-announcements-title"
    >
      <div className="home-announcements-head">
        <h2 id="home-announcements-title">
          <Icon name="megaphone" /> Объявления
        </h2>
        <Link href="/announcements" prefetch={false}>
          {items.length > shown.length
            ? `Все (${items.length})`
            : "Все объявления"}
          <Icon name="chevron" />
        </Link>
      </div>
      <ul>
        {shown.map((n) => (
          <li key={n.id}>
            <Link
              href="/announcements"
              prefetch={false}
              className="home-announcement"
            >
              <span className="home-announcement-meta">
                {n.audience} · {announcementDate(n.createdAt, timezone)}
              </span>
              <strong>{n.title}</strong>
              <span className="home-announcement-body">{n.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
