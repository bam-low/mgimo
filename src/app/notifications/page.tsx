import Link from "next/link";
import { listNotifications } from "@/server/notifications";
import { protectedPage } from "@/server/page";
import {
  notificationActor,
  NotificationShell,
  notificationDate,
} from "./shared";
import { NotificationRead } from "../notification-controls";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const a = await notificationActor(),
    q = await searchParams,
    data = await protectedPage(() => listNotifications(a, q));
  const filter = q.filter === "unread" ? "unread" : "all";
  return (
    <NotificationShell canStudy={data.canStudy}>
      <nav className="notification-filters" aria-label="Фильтр уведомлений">
        <Link
          href="/notifications"
          prefetch={false}
          aria-current={filter === "all" ? "page" : undefined}
        >
          Все
        </Link>
        <Link
          href="/notifications?filter=unread"
          prefetch={false}
          aria-current={filter === "unread" ? "page" : undefined}
        >
          Непрочитанные
        </Link>
      </nav>
      <section aria-label="Список уведомлений" className="notification-list">
        {!data.items.length ? (
          <div className="request">
            <h2>
              {filter === "unread" ? "Всё прочитано" : "Пока нет уведомлений"}
            </h2>
            <p>
              {filter === "unread"
                ? "Новые события появятся здесь после обновления."
                : "Здесь появятся решения по прикреплению, статусы обращений и готовые справки."}
            </p>
          </div>
        ) : (
          data.items.map((n) => (
            <article
              className="request notification-card"
              key={n.id}
              data-unread={!n.readAt}
            >
              <p className="eyebrow">
                {n.readAt ? "Прочитано" : "Непрочитанное"}
              </p>
              <h2>
                <Link
                  href={`/notifications/${n.id}?returnFilter=${filter}${q.cursor ? `&returnCursor=${encodeURIComponent(q.cursor)}` : ""}`}
                  prefetch={false}
                >
                  {n.title}
                </Link>
              </h2>
              <time dateTime={n.createdAt.toISOString()}>
                {notificationDate(n.createdAt, data.timezone)}
              </time>
              <p>{n.message}</p>
              <NotificationRead
                id={n.id}
                readAt={n.readAt?.toISOString() ?? null}
              />
            </article>
          ))
        )}
      </section>
      {data.next && (
        <Link
          className="card-action"
          href={`/notifications?filter=${filter}&cursor=${encodeURIComponent(data.next)}`}
          prefetch={false}
        >
          Следующая страница
        </Link>
      )}
    </NotificationShell>
  );
}
