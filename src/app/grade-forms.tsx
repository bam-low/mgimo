"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScheduleField } from "./schedule-field";
import type { readGrades, subjects } from "@/server/grades";
type Subject = Awaited<ReturnType<typeof subjects>>[number];
type Row = Awaited<ReturnType<typeof readGrades>>["rows"][number];
function useMutation() {
  const router = useRouter(),
    [busy, B] = useState(false),
    [message, M] = useState("");
  const [ready, R] = useState(false);
  useEffect(() => {
    R(true);
  }, []);
  async function send(endpoint: string, data: unknown) {
    B(true);
    M("");
    try {
      const r = await fetch("/api/staff/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const data = await r.json();
        M(
          typeof data.error === "string"
            ? data.error
            : r.status === 409
              ? "Конфликт. Обновите страницу и повторите действие."
              : "Не удалось сохранить. Проверьте данные и действующие права.",
        );
        return false;
      }
      M("Сохранено.");
      router.refresh();
      return true;
    } catch {
      M("Нет связи. Проверьте результат перед повтором.");
      return false;
    } finally {
      B(false);
    }
  }
  return { busy, message, send, ready };
}
export function SubjectForm({ subject }: { subject?: Subject }) {
  const { busy, message, send, ready } = useMutation();
  const [operationId, O] = useState(() => crypto.randomUUID());
  return (
    <form
      className="request"
      aria-busy={!ready}
      data-ready={ready}
      aria-label={subject ? `Дисциплина ${subject.name}` : "Новая дисциплина"}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = await send(
          "subjects",
          subject
            ? {
                action: "EDIT",
                id: subject.id,
                version: subject.version,
                name: f.get("name"),
                active: f.get("active") === "on",
              }
            : { action: "CREATE", operationId, name: f.get("name") },
        );
        if (ok && !subject) O(crypto.randomUUID());
      }}
    >
      <fieldset className="grade-form-fields" disabled={!ready}>
        <label>
          Название дисциплины
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={subject?.name ?? ""}
          />
        </label>
        {subject && (
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={subject.active}
            />{" "}
            Активна для новых результатов
          </label>
        )}
        <button disabled={busy}>
          {subject ? "Сохранить дисциплину" : "Создать дисциплину"}
        </button>
        <p role="status">{message}</p>
      </fieldset>
    </form>
  );
}
export function GradeForm({
  membershipId,
  groupId,
  subjects,
  today,
  row,
  onClose,
  initialSubjectId,
}: {
  membershipId: string;
  groupId?: string;
  subjects: Subject[];
  today: string;
  row?: Row;
  onClose?: () => void;
  initialSubjectId?: string;
}) {
  const { busy, message, send, ready } = useMutation();
  const [operationId, O] = useState(() => crypto.randomUUID());
  const [kind, K] = useState(row?.kind ?? "MARK");
  return (
    <form
      className="request"
      aria-busy={!ready}
      data-ready={ready}
      aria-label={row ? "Исправление результата" : "Выставить результат"}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        if (
          row &&
          !window.confirm(
            "Исправить результат? Прежнее значение останется в аудите.",
          )
        )
          return;
        const result =
          kind === "MARK"
            ? { kind, mark: Number(f.get("value")) }
            : { kind, credit: f.get("value") };
        const ok = await send("grades", {
          action: row ? "EDIT" : "CREATE",
          ...(row
            ? { id: row.id, version: row.version, reason: f.get("reason") }
            : { operationId, membershipId, groupId }),
          subjectId: f.get("subjectId"),
          issuedOn: f.get("issuedOn"),
          result,
        });
        if (ok) {
          if (onClose) onClose();
          else {
            O(crypto.randomUUID());
            form.reset();
            K("MARK");
          }
        }
      }}
    >
      <fieldset className="grade-form-fields" disabled={!ready}>
        <h2>{row ? "Исправление результата" : "Новый результат"}</h2>
        <label>
          Дисциплина
          <select
            aria-label="Дисциплина"
            name="subjectId"
            required
            defaultValue={row?.subjectId ?? initialSubjectId ?? ""}
          >
            <option value="" disabled>
              Выберите дисциплину
            </option>
            {subjects
              .filter((s) => s.active || s.id === row?.subjectId)
              .map((s) => (
                <option key={s.id} value={s.id} disabled={!s.active}>
                  {s.name}
                  {!s.active ? " (неактивна)" : ""}
                </option>
              ))}
          </select>
        </label>
        <ScheduleField
          label="Дата выставления"
          name="issuedOn"
          required
          defaultValue={row?.issuedOn ?? today}
        />
        <label>
          Тип результата
          <select
            aria-label="Тип результата"
            value={kind}
            onChange={(e) => K(e.target.value)}
          >
            <option value="MARK">Оценка</option>
            <option value="CREDIT">Зачёт</option>
          </select>
        </label>
        <label>
          Результат
          <select
            aria-label="Результат"
            name="value"
            key={kind}
            defaultValue={
              row?.kind === kind
                ? (row.mark?.toString() ?? row.credit ?? "")
                : kind === "MARK"
                  ? "5"
                  : "PASSED"
            }
          >
            {kind === "MARK" ? (
              [2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))
            ) : (
              <>
                <option value="PASSED">Зачтено</option>
                <option value="FAILED">Не зачтено</option>
              </>
            )}
          </select>
        </label>
        {row && (
          <label>
            Причина исправления
            <textarea
              name="reason"
              disabled={!ready}
              required
              maxLength={500}
            />
          </label>
        )}
        <button
          disabled={
            busy || (!row && !groupId) || !subjects.some((s) => s.active)
          }
        >
          {busy
            ? "Сохраняем…"
            : row
              ? "Сохранить исправление"
              : "Выставить результат"}
        </button>
        {row && (
          <button type="button" className="secondary" onClick={onClose}>
            Закрыть без сохранения
          </button>
        )}
        <p role="status">{message}</p>
      </fieldset>
    </form>
  );
}
export function GradeActions({
  row,
  membershipId,
  subjects,
  today,
}: {
  row: Row;
  membershipId: string;
  subjects: Subject[];
  today: string;
}) {
  const [edit, E] = useState(false);
  const { busy, message, send, ready } = useMutation();
  if (row.voided)
    return <p className="notice">Аннулировано; история сохранена.</p>;
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={!ready}
        onClick={() => E(!edit)}
      >
        Исправить
      </button>
      {edit && (
        <GradeForm
          key={row.id + "-" + row.version}
          row={row}
          membershipId={membershipId}
          subjects={subjects}
          today={today}
          onClose={() => E(false)}
        />
      )}
      <form
        aria-busy={!ready}
        data-ready={ready}
        aria-label="Аннулирование результата"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            window.confirm(
              "Аннулировать результат? Он исчезнет у студента; история сохранится.",
            )
          )
            await send("grades", {
              action: "VOID",
              id: row.id,
              version: row.version,
              reason: f.get("reason"),
            });
        }}
      >
        <label>
          Причина аннулирования
          <textarea name="reason" disabled={!ready} required maxLength={500} />
        </label>
        <button className="danger" disabled={!ready || busy}>
          Аннулировать
        </button>
        <p role="status">{message}</p>
      </form>
    </>
  );
}
