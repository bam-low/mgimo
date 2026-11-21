import { ScheduleField } from "./schedule-field";
import { displayDate } from "./schedule-input-values";
import { validDay } from "@/lib/schedule-time";

/**
 * A wrong period must not look like a lost session: the page shows the error next
 * to the dates and lists results without the filter instead of calling the server
 * with a range it rejects.
 */
export function checkedPeriod(q: { from?: string; to?: string }) {
  const badDay = (d?: string) => !!d && !validDay(d);
  const error =
    badDay(q.from) || badDay(q.to)
      ? "Проверьте даты периода: используйте формат ДД.ММ.ГГГГ."
      : q.from && q.to && q.from > q.to
        ? "Дата «Период с» позже даты «Период по». Поменяйте их местами."
        : "";
  return error
    ? { from: undefined, to: undefined, error }
    : { from: q.from, to: q.to, error: "" };
}

export function GradePeriod({
  query,
  error = "",
}: {
  error?: string;
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
    <details className="filters-disclosure" open={!!(from || to || error)}>
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
        {error && (
          <p className="form-message is-error" role="alert">
            {error} Показаны все результаты.
          </p>
        )}
        <button className="secondary">Применить период</button>
        <p>
          Оставьте даты пустыми, чтобы увидеть все результаты. Границы
          включаются в период.
        </p>
      </form>
    </details>
  );
}
