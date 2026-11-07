import type { readGrades, subjects } from "@/server/grades";
import { GradeActions } from "./grade-forms";
import { resultLabel } from "@/lib/grade-display";
import { displayDate } from "./schedule-input-values";
export function GradeList({
  data,
  membershipId,
  subjectList,
  today,
}: {
  data: Awaited<ReturnType<typeof readGrades>>;
  membershipId?: string;
  subjectList?: Awaited<ReturnType<typeof subjects>>;
  today?: string;
}) {
  return (
    <section aria-label="Результаты студента">
      <h2>{membershipId ? "Результаты и история" : "Мои результаты"}</h2>
      {!data.rows.length && <p className="notice">Результатов пока нет.</p>}
      {data.rows.map((r) => (
        <article className="request" key={r.id} data-testid="grade-row">
          <h3>{r.subject.name}</h3>
          <p>
            {displayDate(r.issuedOn)} · {r.kind === "MARK" ? "Оценка" : "Зачёт"}
            : <strong>{resultLabel(r)}</strong>
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
              <p className="request" key={e.id}>
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
