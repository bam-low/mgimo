"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui-icon";
export function NotificationEntry({
  initialCount,
}: {
  initialCount: number | null;
}) {
  const [count, C] = useState<number | null>(initialCount);
  const refresh = useCallback(async () => {
    C(null);
    try {
      const r = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (r.ok) {
        const d = await r.json();
        if (Number.isSafeInteger(d.count) && d.count >= 0) C(d.count);
      }
    } catch {
      /* The link remains usable if the badge cannot load. */
    }
  }, []);
  useEffect(() => {
    C(initialCount);
  }, [initialCount]);
  useEffect(() => {
    window.addEventListener("campus-notification-read", refresh);
    return () =>
      window.removeEventListener("campus-notification-read", refresh);
  }, [refresh]);
  return (
    <Link
      href="/notifications"
      prefetch={false}
      className="notification-entry"
      aria-label={
        count === null
          ? "Уведомления, счётчик недоступен"
          : `Уведомления, непрочитанных: ${count}`
      }
    >
      <Icon name="bell" />
      {count !== null && count > 0 && (
        <span aria-hidden="true" className="notification-count">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
export function NotificationRead({
  id,
  readAt,
  auto = false,
}: {
  id: string;
  readAt: string | null;
  auto?: boolean;
}) {
  const [read, R] = useState(readAt),
    [busy, B] = useState(false),
    [error, E] = useState("");
  const router = useRouter();
  useEffect(() => {
    R(readAt);
  }, [readAt]);
  const mark = useCallback(async () => {
    B(true);
    E("");
    try {
      const r = await fetch(
        `/api/notifications/${encodeURIComponent(id)}/read`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!r.ok) throw Error();
      const data = await r.json();
      R(data.readAt);
      window.dispatchEvent(new Event("campus-notification-read"));
      router.refresh();
    } catch {
      E(
        "Не удалось отметить прочитанным. Карточка сохранена — повторите попытку.",
      );
    } finally {
      B(false);
    }
  }, [id, router]);
  useEffect(() => {
    if (auto && !readAt) void mark();
  }, [auto, readAt, mark]);
  if (read) return <span className="notification-read-state">Прочитано</span>;
  return (
    <div>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void mark()}
      >
        {busy ? "Сохраняем…" : "Отметить прочитанным"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function NotificationRefresh() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => router.refresh()}
    >
      Обновить уведомления
    </button>
  );
}
