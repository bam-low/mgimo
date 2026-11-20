import { ScheduleField } from "./schedule-field";
import { displayDate } from "./schedule-input-values";

export function GradePeriod({
  query,
}: {
  query: {
    subjectId?: string;
    from?: string;
    to?: string;
    groupId?: string;
    student?: string;
    history?: string;
    studentsCursor?: string;
  };
}) {
  const from = displayDate(query.from ?? ""),
    to = displayDate(query.to ?? "");
  const summary =
    from || to
      ? `${from ? `с ${from}` : ""}${from && to ? " " : ""}${to ? `по ${to}` : ""}`
      : "все результаты";
  return (
    <details className="filters-disclosure" open={!!(from || to)}>
      <summary>
        Период <small>{summary}</small>
      </summary>
      <form
        method="get"
        className="request grade-period"
        aria-label="Период результатов"
      >
        {(
          [
            "groupId",
            "student",
            "history",
            "studentsCursor",
            "subjectId",
          ] as const
        ).map((name) =>
          query[name] ? (
            <input key={name} type="hidden" name={name} value={query[name]} />
          ) : null,
        )}
        <ScheduleField
          label="Период с"
          name="from"
          defaultValue={query.from ?? ""}
        />
        <ScheduleField
          label="Период по"
          name="to"
          defaultValue={query.to ?? ""}
        />
        <button className="secondary">Применить период</button>
        <p>
          Оставьте даты пустыми, чтобы увидеть все результаты. Границы
          включаются в период.
        </p>
      </form>
    </details>
  );
}
