import type { readGrades, subjects } from "@/server/grades";
import { GradeActions, GradeForm } from "./grade-forms";
import { resultLabel } from "@/lib/grade-display";
import { displayDate } from "./schedule-input-values";
import Link from "next/link";
export function GradeList({
  data,
  membershipId,
  subjectList,
  today,
  groupId,
  query = {},
}: {
  data: Awaited<ReturnType<typeof readGrades>>;
  membershipId?: string;
  subjectList?: Awaited<ReturnType<typeof subjects>>;
  today?: string;
  groupId?: string;
  query?: Record<string, string | undefined>;
}) {
  return (
    <section aria-label="Результаты студента">
      <h2>{membershipId ? "Результаты и история" : "Мои результаты"}</h2>
      <div
        className="grade-summary notice"
        aria-label="Итоги за выбранный период"
      >
        <p>
          Средний балл:{" "}
          <strong data-testid="grade-average">
            {data.summary.average == null
              ? "—"
              : data.summary.average.toLocaleString("ru-RU", {
                  maximumFractionDigits: 2,
                })}
          </strong>{" "}
          · действующих оценок: {data.summary.count}
        </p>
        <p>
          Зачёты отдельно: зачтено — {data.summary.passed}, не зачтено —{" "}
          {data.summary.failed}.
        </p>
        <small>
          За весь выбранный период, включая результаты на других страницах.
          Аннулированные оценки не учитываются.
        </small>
      </div>
      {!data.disciplines.length && (
        <p className="notice">Результатов пока нет.</p>
      )}
      {data.disciplines.map((subject) => {
        const subjectId = subject.id;
        const results = data.rows.filter((r) => r.subjectId === subjectId);
        return (
          <section
            className="request grade-subject"
            key={subjectId}
            aria-label={`Дисциплина: ${subject.name}`}
          >
            <h3>{subject.name}</h3>
            <p>Результатов за период: {subject.count}.</p>
            {!results.length && (
              <p>
                {subject.count
                  ? "Результаты сохранены — откройте дисциплину ниже."
                  : "За выбранный период результатов нет."}
              </p>
            )}
            <p>
              Средний по дисциплине за период:{" "}
              <strong>
                {data.subjectSummary
                  .find((s) => s.subjectId === subjectId)
                  ?.average?.toLocaleString("ru-RU", {
                    maximumFractionDigits: 2,
                  }) ?? "—"}
              </strong>
            </p>
            {membershipId && groupId && (
              <details>
                <summary>Добавить оценку</summary>
                <GradeForm
                  membershipId={membershipId}
                  groupId={groupId}
                  subjects={subjectList!}
                  today={today!}
                  initialSubjectId={subjectId}
                />
              </details>
            )}
            {results.map((r) => (
              <article
                className="request grade-result"
                data-voided={r.voided}
                key={r.id}
                data-testid="grade-row"
              >
                <p>
                  {displayDate(r.issuedOn)} ·{" "}
                  {r.kind === "MARK" ? "Оценка" : "Зачёт"}:{" "}
                  <strong>{resultLabel(r)}</strong>
                  {r.voided ? " · Аннулировано" : ""}
                </p>
                {!r.subject.active && (
                  <p>Дисциплина неактивна. Исторический результат сохранён.</p>
                )}
                {membershipId && (
                  <GradeActions
                    row={r}
                    membershipId={membershipId}
                    subjects={subjectList!}
                    today={today!}
                  />
                )}
              </article>
            ))}
            {!data.subjectId && (
              <Link
                href={{
                  pathname: membershipId ? "/staff/grades" : "/grades",
                  query: {
                    ...query,
                    subjectId,
                    cursor: undefined,
                    auditCursor: undefined,
                  },
                }}
              >
                Все результаты дисциплины →
              </Link>
            )}
            {data.subjectId && data.next && (
              <Link
                href={{
                  pathname: membershipId ? "/staff/grades" : "/grades",
                  query: {
                    ...query,
                    subjectId,
                    cursor: data.next,
                    auditCursor: undefined,
                  },
                }}
              >
                Следующие результаты дисциплины →
              </Link>
            )}
            {data.subjectId && (
              <Link
                href={{
                  pathname: membershipId ? "/staff/grades" : "/grades",
                  query: {
                    ...query,
                    subjectId: undefined,
                    cursor: undefined,
                    auditCursor: undefined,
                  },
                }}
              >
                Все дисциплины
              </Link>
            )}
          </section>
        );
      })}
      {membershipId && (
        <details>
          <summary>Аудит изменений результатов</summary>
          {data.events.map((e) => {
            const detail = JSON.parse(e.reason ?? "{}");
            const show = (v: typeof detail.before) =>
              v
                ? `${displayDate(v.issuedOn)} · ${resultLabel(v)}${v.voided ? " · аннулировано" : ""}`
                : "—";
            return (
              <p
                className="request"
                key={e.id}
                data-testid="grade-audit-event"
                data-grade-id={e.targetId}
                data-audit-action={e.action}
              >
                {e.createdAt} · {e.action} · Автор: {e.actorId}
                <br />
                {show(detail.before)} → {show(detail.after)}
                {detail.reason && (
                  <>
                    <br />
                    Причина: {detail.reason}
                  </>
                )}
              </p>
            );
          })}
          {data.nextAudit && (
            <p>
              Показаны последние 100 событий для этой страницы результатов.
              Полная история сохранена в аудите.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
