"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deadlineLeft, shortDate } from "@/lib/deadlines";
import { Icon } from "./ui-icon";

export type DeadlineItem = {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  dueAt: string;
  day: string;
  time: string;
  done?: boolean;
};

/** Строка дедлайна: название, срок, остаток и личная отметка «Сделано». */
export function DeadlineRow({
  item,
  now,
  today,
  compact = false,
  className,
}: {
  item: DeadlineItem;
  now: string;
  today: string;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [done, D] = useState(!!item.done),
    [busy, B] = useState(false),
    [failed, F] = useState(false);
  const left = deadlineLeft(item, now, today);
  async function toggle() {
    B(true);
    F(false);
    const next = !done;
    const r = await fetch("/api/deadlines/done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, done: next }),
    }).catch(() => null);
    B(false);
    if (!r?.ok) return F(true);
    D(next);
    router.refresh();
  }
  return (
    <li
      className={className ? `deadline-row ${className}` : "deadline-row"}
      data-done={done ? "" : undefined}
      data-urgent={left.urgent && !done ? "" : undefined}
      data-testid="deadline"
    >
      <div className="deadline-main">
        <strong>{item.title}</strong>
        {!compact && item.body && <p>{item.body}</p>}
        <span className="deadline-when">
          до {shortDate(item.day)}, {item.time}
          {!left.past && (
            <span className="deadline-left">
              {done ? "сделано" : left.label}
            </span>
          )}
        </span>
        {failed && (
          <span className="deadline-error" role="alert">
            Не сохранилось. Повторите.
          </span>
        )}
      </div>
      {!left.past && (
        <button
          type="button"
          className="deadline-done"
          aria-pressed={done}
          aria-label={done ? `Вернуть «${item.title}»` : `Отметить «${item.title}» сделанным`}
          disabled={busy}
          onClick={toggle}
        >
          <Icon name="check" />
        </button>
      )}
    </li>
  );
}
