"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./ui-icon";
import { announcementDate, type AnnouncementItem } from "./announcement-list";

/**
 * Свежие непрочитанные объявления на главной студента — компактно, по строке
 * на объявление. «Прочитано» убирает его с главной; в разделе оно остаётся.
 */
export function HomeAnnouncements({
  items,
  timezone,
}: {
  items: AnnouncementItem[];
  timezone: string;
}) {
  const router = useRouter();
  const [read, R] = useState<string[]>([]),
    [error, E] = useState("");
  const unread = items.filter((n) => !read.includes(n.id));
  if (!unread.length) return null;
  // Телефон — одно последнее, компьютер — до двух (второе скрывается стилями).
  const shown = unread.slice(0, 2);
  async function markRead(id: string) {
    E("");
    R((r) => [...r, id]);
    try {
      const r = await fetch("/api/announcements/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw Error();
      router.refresh();
    } catch {
      R((r) => r.filter((x) => x !== id));
      E("Не удалось отметить. Попробуйте ещё раз.");
    }
  }
  return (
    <section
      className="home-announcements"
      aria-labelledby="home-announcements-title"
    >
      <div className="home-announcements-head">
        <h2 id="home-announcements-title">
          <Icon name="megaphone" /> Объявления
          {unread.length > 1 && (
            <span className="home-announcements-count">{unread.length}</span>
          )}
        </h2>
        <Link href="/announcements" prefetch={false}>
          Все
          <Icon name="chevron" />
        </Link>
      </div>
      <ul>
        {shown.map((n, i) => (
          <li
            key={n.id}
            className={`home-announcement${i ? " is-desktop-extra" : ""}`}
          >
            <Link href="/announcements" prefetch={false}>
              <strong>{n.title}</strong>
              <span className="home-announcement-meta">
                {n.audience} · {announcementDate(n.createdAt, timezone)}
              </span>
            </Link>
            <button
              type="button"
              className="home-announcement-read"
              onClick={() => markRead(n.id)}
              aria-label={`Прочитано: ${n.title}`}
            >
              <Icon name="check" />
              <span>Прочитано</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="home-announcements-error">
          {error}
        </p>
      )}
    </section>
  );
}
