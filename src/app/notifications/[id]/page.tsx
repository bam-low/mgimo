import Link from "next/link";
import { notificationDetail } from "@/server/notifications";
import { protectedPage } from "@/server/page";
import { listCursor } from "@/lib/pagination";
import {
  notificationActor,
  NotificationShell,
  notificationDate,
} from "../shared";
import { NotificationRead } from "../../notification-controls";
export const dynamic = "force-dynamic";
function actionLabel(kind: string) {
  if (kind.startsWith("ENROLLMENT")) return "Посмотреть состояние прикрепления";
  if (kind.startsWith("SCHEDULE")) return "Открыть расписание";
  if (kind.startsWith("EXAM")) return "Открыть сессию";
  if (kind.startsWith("DEADLINE")) return "Открыть дедлайны";
  if (kind.startsWith("PORTFOLIO")) return "Открыть портфолио";
  return "Открыть заявку";
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const a = await notificationActor(),
    { id } = await params,
    data = await protectedPage(() => notificationDetail(a, id)),
    n = data.notification,
    q = await searchParams;
  const filter = q.returnFilter === "unread" ? "unread" : "all",
    cursor = listCursor(q.returnCursor),
    back = `/notifications?filter=${filter}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  return (
    <NotificationShell canStudy={data.canStudy}>
      <Link href={back} prefetch={false}>
        ← К списку уведомлений
      </Link>
      <article className="request notification-card">
        <p className="eyebrow">Личное событие</p>
        <h2>{n.title}</h2>
        <time dateTime={n.createdAt.toISOString()}>
          {notificationDate(n.createdAt, data.timezone)}
        </time>
        <p>{n.message}</p>
        <NotificationRead
          id={n.id}
          readAt={n.readAt?.toISOString() ?? null}
          auto
        />
        {n.notice && <p className="notice">{n.notice}</p>}
        {n.target.available && "href" in n.target ? (
          <Link className="card-action" prefetch={false} href={n.target.href!}>
            {actionLabel(n.kind)}
          </Link>
        ) : (
          <p role="status" className="notice">
            {n.target.reasonCode === "PREVIOUS_ENROLLMENT"
              ? "Решение относится к предыдущему запросу прикрепления."
              : n.kind === "SCHEDULE_CANCELLED" || n.kind === "SCHEDULE_MOVED"
                ? "Доступ к этому расписанию закрыт. История уведомления сохранена."
                : "Учебный доступ закрыт. Содержание обращения и документы сейчас недоступны."}
          </p>
        )}
      </article>
    </NotificationShell>
  );
}
