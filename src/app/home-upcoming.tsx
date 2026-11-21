import Link from "next/link";
import { examKindLabel, countdownLabel } from "@/lib/session";
import { shortDate } from "@/lib/deadlines";
import { DeadlineRow, type DeadlineItem } from "./deadline-items";
import { Icon } from "./ui-icon";

type Exam = {
  kind: string;
  title: string;
  day: string;
  startTime: string;
  room: string;
  days: number;
} | null;

/**
 * «Сроки» на главной: ближайший экзамен (≤ 14 дней) и невыполненные дедлайны.
 * Нечего показать — блока нет.
 */
export function HomeUpcoming({
  exam,
  deadlines,
  now,
  today,
}: {
  exam: Exam;
  deadlines: DeadlineItem[];
  now: string;
  today: string;
}) {
  const open = deadlines.filter((d) => !d.done).slice(0, 2);
  if (!exam && !open.length) return null;
  return (
    <section className="home-upcoming" aria-labelledby="home-upcoming-title">
      <header className="home-upcoming-head">
        <h2 id="home-upcoming-title">
          <Icon name="clock" /> Сроки
        </h2>
        <Link href="/deadlines" className="home-upcoming-all">
          Все <Icon name="chevron" />
        </Link>
      </header>
      {exam && (
        <Link className="home-exam" href="/grades/session" data-testid="home-exam">
          <span className="flag flag-exam">{examKindLabel(exam.kind)}</span>
          <strong>{exam.title}</strong>
          <span className="home-exam-when">
            {shortDate(exam.day)}, {exam.startTime} · {exam.room}
          </span>
          <span className="home-exam-left" data-soon={exam.days <= 1 ? "" : undefined}>
            {countdownLabel(exam.days)}
          </span>
        </Link>
      )}
      {open.length > 0 && (
        <ul className="deadline-list is-home">
          {open.map((d, i) => (
            <DeadlineRow
              key={d.id}
              item={d}
              now={now}
              today={today}
              compact
              className={i > 0 ? "is-desktop-extra" : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
