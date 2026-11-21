"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { examKinds } from "@/lib/session";
import { Icon } from "./ui-icon";

export type SessionCatalog = {
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string; subjectIds: string[] }[];
  rooms: { id: string; name: string }[];
};
export type SessionGroup = { id: string; name: string; context: string };

async function send(body: unknown) {
  const r = await fetch("/api/staff/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const result = await r.json().catch(() => ({}));
    throw Error(
      typeof result.error === "string"
        ? result.error
        : "Не удалось сохранить. Проверьте соединение.",
    );
  }
}

/** Дата, время, преподаватель и аудитория — общие поля назначения и переноса. */
function SlotFields({
  catalog,
  subjectId,
  today,
  initial,
}: {
  catalog: SessionCatalog;
  subjectId: string;
  today: string;
  initial?: {
    day: string;
    startTime: string;
    endTime: string;
    teacherId: string;
    roomId: string;
  };
}) {
  const teachers = catalog.teachers.filter((t) =>
    t.subjectIds.includes(subjectId),
  );
  return (
    <div className="session-fields">
      <label>
        Дата
        <input
          type="date"
          name="day"
          required
          min={today}
          defaultValue={initial?.day}
        />
      </label>
      <label>
        Начало
        <input
          type="time"
          name="startTime"
          required
          defaultValue={initial?.startTime ?? "10:00"}
        />
      </label>
      <label>
        Конец
        <input
          type="time"
          name="endTime"
          required
          defaultValue={initial?.endTime ?? "13:00"}
        />
      </label>
      <label>
        Преподаватель
        <select
          name="teacherId"
          required
          defaultValue={initial?.teacherId ?? ""}
          key={subjectId}
          disabled={!subjectId}
        >
          <option value="" disabled>
            {subjectId
              ? teachers.length
                ? "Выберите"
                : "Нет преподавателей дисциплины"
              : "Сначала дисциплина"}
          </option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Аудитория
        <select name="roomId" required defaultValue={initial?.roomId ?? ""}>
          <option value="" disabled>
            Выберите
          </option>
          {catalog.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** «Назначить»: тип, дисциплина, группы и слот. */
export function ExamCreate({
  catalog,
  groups,
  today,
}: {
  catalog: SessionCatalog;
  groups: SessionGroup[];
  today: string;
}) {
  const router = useRouter();
  const operation = useRef<string | undefined>(undefined);
  const [open, O] = useState(false),
    [subjectId, S] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    [ok, K] = useState(false);
  if (!open)
    return (
      <div className="portfolio-add-start">
        <button type="button" onClick={() => (O(true), M(""))}>
          <Icon name="plus" />
          Назначить
        </button>
        {ok && message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="editor-panel session-form"
      aria-label="Назначить экзамен"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const groupIds = f.getAll("groupIds").map(String);
        K(false);
        if (!groupIds.length) return M("Выберите хотя бы одну группу.");
        B(true);
        M("");
        try {
          await send({
            action: "CREATE",
            operationId: (operation.current ??= crypto.randomUUID()),
            kind: f.get("kind"),
            subjectId,
            groupIds,
            day: f.get("day"),
            startTime: f.get("startTime"),
            endTime: f.get("endTime"),
            teacherId: f.get("teacherId"),
            roomId: f.get("roomId"),
          });
          operation.current = undefined;
          form.reset();
          S("");
          O(false);
          K(true);
          M("Назначено. Студенты видят это в «Сессии».");
          router.refresh();
        } catch (err) {
          M(err instanceof Error ? err.message : "Не удалось сохранить.");
        } finally {
          B(false);
        }
      }}
    >
      <div className="portfolio-form-head">
        <h2>Назначить</h2>
        <button
          type="button"
          className="secondary"
          onClick={() => O(false)}
          disabled={busy}
        >
          Отмена
        </button>
      </div>
      <fieldset disabled={busy}>
        <div className="session-fields">
          <label>
            Тип
            <select name="kind" defaultValue="EXAM">
              {Object.entries(examKinds).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="session-wide">
            Дисциплина
            <select
              required
              value={subjectId}
              onChange={(e) => S(e.target.value)}
            >
              <option value="" disabled>
                Выберите
              </option>
              {catalog.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="session-groups">
          <legend>Группы</legend>
          {groups.length ? (
            groups.map((g) => (
              <label key={g.id} className="check-line">
                <input type="checkbox" name="groupIds" value={g.id} />
                <span>
                  {g.name}
                  <small>{g.context}</small>
                </span>
              </label>
            ))
          ) : (
            <p className="footnote">Нет действующих групп.</p>
          )}
        </fieldset>
        <SlotFields catalog={catalog} subjectId={subjectId} today={today} />
        <button type="submit">{busy ? "Сохраняем…" : "Назначить"}</button>
      </fieldset>
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

/** «Перенести» и «Отменить» у назначенного экзамена. Студенты получат уведомление. */
export function ExamActions({
  exam,
  catalog,
  today,
}: {
  exam: {
    id: string;
    version: number;
    subjectId: string;
    title: string;
    day: string;
    startTime: string;
    endTime: string;
    teacherId: string;
    roomId: string;
  };
  catalog: SessionCatalog;
  today: string;
}) {
  const router = useRouter();
  const [moving, V] = useState(false),
    [busy, B] = useState(false),
    [message, M] = useState("");
  async function run(body: unknown) {
    B(true);
    M("");
    try {
      await send(body);
      V(false);
      router.refresh();
    } catch (err) {
      M(err instanceof Error ? err.message : "Не удалось сохранить.");
    } finally {
      B(false);
    }
  }
  return (
    <div className="exam-actions">
      {moving ? (
        <form
          className="exam-move"
          aria-label={`Перенести «${exam.title}»`}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run({
              action: "MOVE",
              id: exam.id,
              version: exam.version,
              day: f.get("day"),
              startTime: f.get("startTime"),
              endTime: f.get("endTime"),
              teacherId: f.get("teacherId"),
              roomId: f.get("roomId"),
            });
          }}
        >
          <fieldset disabled={busy}>
            <SlotFields
              catalog={catalog}
              subjectId={exam.subjectId}
              today={today}
              initial={exam}
            />
            <div className="portfolio-submit">
              <button type="submit">Сохранить перенос</button>
              <button
                type="button"
                className="secondary"
                onClick={() => (V(false), M(""))}
              >
                Отмена
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="portfolio-submit">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => V(true)}
          >
            Перенести
          </button>
          <button
            type="button"
            className="secondary danger"
            disabled={busy}
            onClick={() =>
              confirm(`Отменить «${exam.title}»? Студенты получат уведомление.`) &&
              void run({ action: "CANCEL", id: exam.id, version: exam.version })
            }
          >
            Отменить
          </button>
        </div>
      )}
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
