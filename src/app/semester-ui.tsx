"use client";
import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  calendarInput,
  civilDay,
  parity,
  excluded,
  type Calendar,
  type Rule,
  dates,
  ruleInput,
} from "@/lib/semester";
import { addDays, monday, dayKey, timeLabel } from "@/lib/schedule-time";
import { assignmentBlocks } from "@/lib/teaching-assignment";
import { ScheduleField } from "./schedule-field";
import { displayDate } from "./schedule-input-values";
import { readableBuilderError, weekdayShort } from "./builder-messages";
import { AssignmentEditor } from "./teaching-assignments-ui";
import type {
  builderCatalog,
  builderWeek,
  BuilderCommand,
} from "@/server/semester-builder";
type Catalog = Awaited<ReturnType<typeof builderCatalog>>;
type Week = Awaited<ReturnType<typeof builderWeek>>;
type Preview = {
  id: string;
  token: string;
  dates: {
    day: string;
    groupCount: number;
    status: string;
    groups: string[];
    title: string;
    teacher: string;
    room: string;
    startTime: string;
    endTime: string;
  }[];
  affected: { id: string; day: string }[];
  skipped: string[];
  skippedCount: number;
  warnings: string[];
};
function Field({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={120}
      />
    </label>
  );
}
/** Drops a leftover #anchor so router.refresh() does not scroll the page away from the form. */
function clearHash() {
  if (window.location.hash)
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
}
async function builderRequest(body: unknown) {
  const response = await fetch("/api/staff/schedule/builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}
export function BuilderMutation({
  command,
  children,
  onSaved,
  blocked = false,
}: {
  blocked?: boolean;
  command: () => BuilderCommand;
  children: ReactNode;
  onSaved?: (preview: Preview) => void;
}) {
  const [preview, P] = useState<Preview | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [done, D] = useState(false),
    [ready, Ready] = useState(false);
  useEffect(() => Ready(true), []);
  const sequence = useRef(0),
    router = useRouter();
  const signature = JSON.stringify(command());
  useEffect(() => {
    ++sequence.current;
    P(null);
    E("");
    D(false);
  }, [signature]);
  async function send(commit: boolean) {
    const serial = ++sequence.current;
    B(true);
    E("");
    D(false);
    try {
      const { response, data } = await builderRequest({
        command: command(),
        preview: !commit,
        ...(commit ? { token: preview?.token, confirmed: true } : {}),
      });
      if (sequence.current !== serial) return;
      if (!response.ok) {
        E(readableBuilderError(data.error ?? "Не удалось сохранить"));
        P(null);
        return;
      }
      if (commit) {
        P(null);
        D(true);
        clearHash();
        router.refresh();
        onSaved?.(data);
      } else P(data);
    } catch {
      if (sequence.current === serial)
        E(
          "Не удалось выполнить проверку. Проверьте поля и соединение. Ввод сохранён.",
        );
    } finally {
      B(false);
    }
  }
  return (
    <form
      className="builder-form"
      onChange={() => {
        ++sequence.current;
        P(null);
        E("");
        D(false);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void send(false);
      }}
    >
      <fieldset disabled={busy || !ready}>{children}</fieldset>
      <p
        role="status"
        className={
          error
            ? `form-message is-error${error.startsWith("Пересечение:") ? " is-conflict" : ""}`
            : done
              ? "form-message is-success"
              : "form-message"
        }
      >
        {error || (done ? "Изменения сохранены" : busy ? "Проверяем…" : "")}
      </p>
      <button disabled={busy || !ready || blocked} type="submit">
        Проверить изменения
      </button>
      {preview && (
        <section
          className="builder-preview"
          aria-label="Предпросмотр изменений"
        >
          <h3>Предпросмотр перед сохранением</h3>
          {(preview.dates.length > 0 ||
            preview.affected.length > 0 ||
            preview.skippedCount > 0) && (
            <p>
              Новых / изменяемых занятий: {preview.dates.length}. Прежних
              затронуто: {preview.affected.length}. Исключённых занятий:{" "}
              {preview.skippedCount}.
            </p>
          )}
          {preview.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          {preview.dates[0] && (
            <div className="publication-summary">
              <h4>{preview.dates[0].title}</h4>
              <p>
                {preview.dates[0].teacher} · {preview.dates[0].room}
              </p>
              <p>
                <strong>Группы:</strong>{" "}
                {[...new Set(preview.dates.flatMap((d) => d.groups))].join(
                  ", ",
                )}
              </p>
            </div>
          )}
          <details
            open
            hidden={
              !preview.dates.length &&
              !preview.affected.length &&
              !preview.skipped.length
            }
          >
            <summary>Конкретные даты и затронутые занятия</summary>
            <ul className="preview-dates">
              {preview.dates.map((d, i) => (
                <li key={i}>
                  {displayDate(d.day)} · {d.startTime}–{d.endTime} ·{" "}
                  {d.groups.join(", ")} ·{" "}
                  {d.status === "SCHEDULED"
                    ? "запланировано"
                    : "отмена / удаление"}
                </li>
              ))}
              {preview.affected.map((d) => (
                <li key={d.id}>Прежнее: {displayDate(d.day)}</li>
              ))}
              {preview.skipped.map((d) => (
                <li key={d}>Исключено: {displayDate(d)}</li>
              ))}
            </ul>
          </details>
          <p>
            Изменения сохранятся сразу для всех указанных групп. История
            сохранится. Если найдётся пересечение, ничего не запишется.
          </p>
          <button type="button" disabled={busy} onClick={() => void send(true)}>
            Подтвердить и сохранить
          </button>
        </section>
      )}
    </form>
  );
}
export function SemesterCalendar({
  calendar,
  initial,
}: {
  calendar: Calendar;
  initial?: string;
}) {
  const [cursor, C] = useState(initial ?? calendar.start);
  const parsed = calendarInput.safeParse(calendar);
  if (
    !calendar.name.trim() ||
    !calendar.start ||
    !calendar.end ||
    !calendar.anchor
  )
    return (
      <p className="notice">
        Заполните название и даты, чтобы увидеть календарь и чередование недель.
      </p>
    );
  if (!parsed.success)
    return (
      <ul className="form-message is-error" aria-label="Ошибки календаря">
        {parsed.error.issues.map((e, i) => (
          <li key={i}>
            {(
              {
                name: "Название",
                start: "Начало",
                end: "Окончание",
                anchor: "Опорный понедельник",
                exclusions: "Исключения",
              } as Record<string, string>
            )[String(e.path[0])] ?? "Календарь"}
            : {e.code === "custom" ? e.message : "Проверьте значение поля."}
          </li>
        ))}
      </ul>
    );
  const from = civilDay(cursor) ? monday(cursor) : monday(calendar.start);
  return (
    <section className="semester-calendar" aria-label="Календарь семестра">
      <h3>Календарь и чередование недель</h3>
      <p>
        {displayDate(calendar.start)} — {displayDate(calendar.end)}. Опорный
        понедельник: {displayDate(calendar.anchor)}. Исключения не сдвигают
        недели.
      </p>
      <ScheduleField
        label="Перейти к дате календаря"
        broad
        value={cursor}
        onValueChange={C}
      />
      <div className="week-nav">
        <button
          className="secondary"
          type="button"
          onClick={() => C(addDays(from, -28))}
        >
          ← Ранее
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => C(addDays(from, 28))}
        >
          Позднее →
        </button>
      </div>
      {Array.from({ length: 4 }, (_, w) => {
        const week = addDays(from, w * 7),
          a = parity(week, calendar.anchor) === "A";
        return (
          <div
            className={`calendar-week ${a ? "week-a" : "week-b"}`}
            key={week}
          >
            <p>
              <strong>{a ? "Числитель" : "Знаменатель"}</strong> · с{" "}
              {displayDate(week)}
            </p>
            <div className="calendar-days">
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(week, i),
                  outside = d < calendar.start || d > calendar.end,
                  skip = excluded(d, calendar);
                return (
                  <div
                    key={d}
                    className={`${outside ? "outside" : ""} ${skip ? "excluded" : ""}`}
                    title={`${displayDate(d)}${skip ? ": исключено" : outside ? ": вне семестра" : ""}`}
                  >
                    <span>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][i]}</span>
                    <strong>{d.slice(8)}</strong>
                    {skip && <small>×</small>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="footnote">
        × — исключённая дата; приглушённые дни — вне семестра.
      </p>
    </section>
  );
}
export function SemesterEditor({
  semester,
  onCreated,
}: {
  semester?: Catalog["semesters"][number];
  onCreated?: (id: string, start?: string) => void;
}) {
  const [calendar, C] = useState<Calendar>(
      semester?.calendar ?? {
        name: "",
        start: "",
        end: "",
        anchor: "",
        exclusions: [],
      },
    ),
    [op] = useState(() => crypto.randomUUID()),
    [firstWeek, FW] = useState<"A" | "B">("A");
  function update<K extends keyof Calendar>(key: K, value: Calendar[K]) {
    C((c) => ({
      ...c,
      [key]: value,
      ...(!semester && key === "start" && civilDay(value as string)
        ? {
            anchor:
              firstWeek === "A"
                ? monday(value as string)
                : addDays(monday(value as string), -7),
          }
        : {}),
    }));
  }
  return (
    <div className="semester-edit-grid">
      <section className="editor-panel">
        <h2>{semester ? "Настроить семестр" : "Создать семестр"}</h2>
        <BuilderMutation
          onSaved={() => {
            if (!semester) onCreated?.(op, calendar.start);
          }}
          command={() =>
            semester
              ? {
                  action: "SEMESTER_EDIT",
                  id: semester.id,
                  version: semester.version,
                  calendar,
                }
              : { action: "SEMESTER_CREATE", operationId: op, calendar }
          }
        >
          <Field
            label="Название семестра"
            value={calendar.name}
            onChange={(v) => update("name", v)}
          />
          <ScheduleField
            label="Дата начала семестра"
            broad
            required
            value={calendar.start}
            onValueChange={(v) => update("start", v)}
          />
          <ScheduleField
            label="Дата окончания семестра"
            broad
            required
            value={calendar.end}
            onValueChange={(v) => update("end", v)}
          />
          <label>
            Неделя с датой начала
            <select
              value={
                civilDay(calendar.start) && civilDay(calendar.anchor)
                  ? parity(calendar.start, calendar.anchor)
                  : firstWeek
              }
              onChange={(e) => {
                const v = e.target.value as "A" | "B";
                FW(v);
                if (civilDay(calendar.start))
                  update(
                    "anchor",
                    v === "A"
                      ? monday(calendar.start)
                      : addDays(monday(calendar.start), -7),
                  );
              }}
            >
              <option value="A">Числитель</option>
              <option value="B">Знаменатель</option>
            </select>
          </label>
          {civilDay(calendar.start) && civilDay(calendar.anchor) && (
            <p className="notice">
              Дата начала {displayDate(calendar.start)} —{" "}
              {parity(calendar.start, calendar.anchor) === "A"
                ? "числитель"
                : "знаменатель"}
              . Дни до начала недоступны для публикации.
            </p>
          )}
          <ScheduleField
            label="Первая неделя-числитель (понедельник)"
            broad
            required
            value={calendar.anchor}
            onValueChange={(v) => update("anchor", v)}
          />
          <h3>Исключённые даты и периоды</h3>
          <p>
            Для одного дня укажите одинаковые начало и конец. Все даты должны
            находиться внутри семестра.
          </p>
          {calendar.exclusions.map((e, i) => (
            <fieldset className="exclusion-row" key={i}>
              <legend>Исключение {i + 1}</legend>
              <ScheduleField
                label={`Начало исключения ${i + 1}`}
                broad
                required
                value={e.from}
                onValueChange={(v) =>
                  update(
                    "exclusions",
                    calendar.exclusions.map((x, j) =>
                      j === i ? { ...x, from: v } : x,
                    ),
                  )
                }
              />
              <ScheduleField
                label={`Конец исключения ${i + 1}`}
                broad
                required
                value={e.to}
                onValueChange={(v) =>
                  update(
                    "exclusions",
                    calendar.exclusions.map((x, j) =>
                      j === i ? { ...x, to: v } : x,
                    ),
                  )
                }
              />
              <label>
                Пояснение
                <input
                  value={e.reason}
                  maxLength={200}
                  onChange={(ev) =>
                    update(
                      "exclusions",
                      calendar.exclusions.map((x, j) =>
                        j === i ? { ...x, reason: ev.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  update(
                    "exclusions",
                    calendar.exclusions.filter((_, j) => i !== j),
                  )
                }
              >
                Убрать исключение {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              update("exclusions", [
                ...calendar.exclusions,
                { from: "", to: "", reason: "" },
              ])
            }
          >
            Добавить исключение
          </button>
        </BuilderMutation>
      </section>
      <SemesterCalendar calendar={calendar} />
    </div>
  );
}
export function Semesters({ catalog }: { catalog: Catalog }) {
  const [edit, E] = useState<string | null>(null),
    s = catalog.semesters.find((s) => s.id === edit);
  return (
    <>
      <section className="semester-list" aria-label="Учебные семестры">
        <h2>Учебные семестры</h2>
        {!catalog.semesters.length && (
          <p>Семестров пока нет. Создайте собственный календарь.</p>
        )}
        {catalog.semesters.map((s) => (
          <article className="semester-card" key={s.id}>
            <h3>{s.calendar.name}</h3>
            <p>
              {displayDate(s.calendar.start)} — {displayDate(s.calendar.end)}
            </p>
            <p>Понедельник числителя: {displayDate(s.calendar.anchor)}</p>
            <span className="badge">Настроен · версия {s.version}</span>
            <div className="semester-links">
              <button
                type="button"
                className="secondary"
                onClick={() => E(s.id)}
              >
                Настроить {s.calendar.name}
              </button>
              <Link href={`/staff/schedule/builder?semesterId=${s.id}`}>
                Перейти к расписанию
              </Link>
            </div>
          </article>
        ))}
        <button type="button" onClick={() => E(null)}>
          Создать семестр
        </button>
      </section>
      <SemesterEditor
        key={`${s?.id ?? "new"}:${s?.version ?? 0}`}
        semester={s}
        onCreated={E}
      />
    </>
  );
}
export function Resources({ catalog }: { catalog: Catalog }) {
  const [kind, K] = useState<"teacher" | "room">("teacher"),
    [selected, S] = useState("");
  const teacher =
      kind === "teacher"
        ? catalog.teachers.find((t) => t.id === selected)
        : undefined,
    room =
      kind === "room"
        ? catalog.rooms.find((t) => t.id === selected)
        : undefined;
  return (
    <>
      <p>
        Дисциплины общие с успеваемостью.{" "}
        <Link href="/staff/grades">Управлять дисциплинами</Link>. Преподаватели
        не получают аккаунты.
      </p>
      <div className="semester-links">
        <button
          className="secondary"
          aria-pressed={kind === "teacher"}
          onClick={() => {
            K("teacher");
            S("");
          }}
        >
          Преподаватели
        </button>
        <button
          className="secondary"
          aria-pressed={kind === "room"}
          onClick={() => {
            K("room");
            S("");
          }}
        >
          Аудитории
        </button>
      </div>
      <div className="semester-edit-grid">
        <section>
          <h2>{kind === "teacher" ? "Преподаватели" : "Аудитории"}</h2>
          {!(kind === "teacher" ? catalog.teachers : catalog.rooms).length && (
            <p className="notice">
              {kind === "teacher"
                ? "Преподавателей пока нет. Добавьте первого в форме рядом."
                : "Аудиторий пока нет. Добавьте первую в форме рядом."}
            </p>
          )}
          {(kind === "teacher"
            ? catalog.teachers.map((t) => ({ ...t, title: t.name }))
            : catalog.rooms.map((r) => ({
                ...r,
                title: `${r.building} · ${r.number}`,
              }))
          ).map((r) => (
            <article className="semester-card" key={r.id}>
              <h3>{r.title}</h3>
              <p>{r.active ? "Действует" : "Неактивен"}</p>
              <button className="secondary" onClick={() => S(r.id)}>
                Настроить {r.title}
              </button>
            </article>
          ))}
        </section>
        <ResourceForm
          key={`${kind}:${selected}:${teacher?.version ?? room?.version ?? 0}`}
          kind={kind}
          teacher={teacher}
          room={room}
          catalog={catalog}
          reset={() => S("")}
          onCreated={S}
        />
      </div>
    </>
  );
}
/** Returns from the directory to the open lesson form (or the filters) without leaving a #hash behind. */
export function BackToBuilder() {
  return (
    <a
      href="#builder-filters"
      onClick={(e) => {
        e.preventDefault();
        clearHash();
        (
          document.querySelector("#builder-inspector .ready-lessons") ??
          document.getElementById("builder-inspector") ??
          document.getElementById("builder-filters")
        )?.scrollIntoView({ block: "start" });
      }}
    >
      Вернуться к форме занятия →
    </a>
  );
}
/**
 * Inline "add teacher / room" inside a lesson form. Uses the same builder
 * commands as the directory (check, then confirm) and is not a nested <form>.
 */
export function QuickResource({
  kind,
  subjectId = "",
  onCreated,
}: {
  kind: "teacher" | "room";
  subjectId?: string;
  onCreated: (id: string) => void;
}) {
  const [open, O] = useState(false),
    [name, N] = useState(""),
    [building, Bld] = useState(""),
    [number, Num] = useState(""),
    [message, M] = useState(""),
    [failed, Fail] = useState(false),
    [busy, B] = useState(false),
    [op, Op] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const ready =
    kind === "teacher"
      ? !!name.trim() && !!subjectId
      : !!building.trim() && !!number.trim();
  async function create() {
    if (!ready || busy) return;
    B(true);
    M("");
    Fail(false);
    const command: BuilderCommand =
      kind === "teacher"
        ? {
            action: "TEACHER_CREATE",
            operationId: op,
            name: name.trim(),
            subjectIds: [subjectId],
          }
        : {
            action: "ROOM_CREATE",
            operationId: op,
            building: building.trim(),
            number: number.trim(),
          };
    try {
      const checked = await builderRequest({ command, preview: true });
      if (!checked.response.ok) throw new Error(checked.data.error);
      const saved = await builderRequest({
        command,
        preview: false,
        token: checked.data.token,
        confirmed: true,
      });
      if (!saved.response.ok) throw new Error(saved.data.error);
      clearHash();
      router.refresh();
      onCreated(op);
      M(
        kind === "teacher"
          ? `Преподаватель «${name.trim()}» добавлен и выбран.`
          : `Аудитория ${building.trim()} · ${number.trim()} добавлена и выбрана.`,
      );
      N("");
      Bld("");
      Num("");
      Op(crypto.randomUUID());
      O(false);
    } catch (e) {
      Fail(true);
      M(
        readableBuilderError(
          e instanceof Error && e.message
            ? e.message
            : "Не удалось добавить. Ввод сохранён.",
        ),
      );
    } finally {
      B(false);
    }
  }
  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void create();
    }
  };
  return (
    <>
      <details
        className="quick-resource"
        open={open}
        onToggle={(e) => O(e.currentTarget.open)}
      >
        <summary>
          {kind === "teacher"
            ? "+ Добавить преподавателя прямо здесь"
            : "+ Добавить аудиторию прямо здесь"}
        </summary>
        <div className="quick-resource-fields">
          {kind === "teacher" ? (
            <label>
              Вымышленное имя преподавателя
              <input
                value={name}
                maxLength={120}
                onChange={(e) => N(e.target.value)}
                onKeyDown={submitOnEnter}
              />
            </label>
          ) : (
            <>
              <label>
                Корпус
                <input
                  value={building}
                  maxLength={120}
                  onChange={(e) => Bld(e.target.value)}
                  onKeyDown={submitOnEnter}
                />
              </label>
              <label>
                Номер аудитории
                <input
                  value={number}
                  maxLength={120}
                  onChange={(e) => Num(e.target.value)}
                  onKeyDown={submitOnEnter}
                />
              </label>
            </>
          )}
          <button
            type="button"
            className="secondary"
            disabled={!ready || busy}
            onClick={() => void create()}
          >
            {busy
              ? "Добавляем…"
              : kind === "teacher"
                ? "Добавить и выбрать преподавателя"
                : "Добавить и выбрать аудиторию"}
          </button>
        </div>
      </details>
      {message && (
        <p
          role="status"
          className={
            failed ? "form-message is-error" : "form-message is-success"
          }
        >
          {message}
        </p>
      )}
    </>
  );
}
function ResourceForm({
  kind,
  teacher,
  room,
  catalog,
  reset,
  onCreated,
}: {
  kind: "teacher" | "room";
  teacher?: Catalog["teachers"][number];
  room?: Catalog["rooms"][number];
  catalog: Catalog;
  reset: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, N] = useState(teacher?.name ?? ""),
    [building, B] = useState(room?.building ?? ""),
    [number, Num] = useState(room?.number ?? ""),
    [active, A] = useState(teacher?.active ?? room?.active ?? true),
    [subjects, S] = useState(teacher?.subjectIds ?? []),
    [op] = useState(() => crypto.randomUUID());
  return (
    <section className="editor-panel">
      <h2>
        {teacher || room
          ? "Настроить запись"
          : kind === "teacher"
            ? "Добавить преподавателя"
            : "Добавить аудиторию"}
      </h2>
      <BuilderMutation
        onSaved={() => {
          if (!teacher && !room) onCreated(op);
        }}
        command={() =>
          kind === "teacher"
            ? teacher
              ? {
                  action: "TEACHER_EDIT",
                  id: teacher.id,
                  version: teacher.version,
                  name,
                  active,
                  subjectIds: subjects,
                }
              : {
                  action: "TEACHER_CREATE",
                  operationId: op,
                  name,
                  subjectIds: subjects,
                }
            : room
              ? {
                  action: "ROOM_EDIT",
                  id: room.id,
                  version: room.version,
                  building,
                  number,
                  active,
                }
              : { action: "ROOM_CREATE", operationId: op, building, number }
        }
      >
        {kind === "teacher" ? (
          <>
            <Field
              label="Вымышленное имя преподавателя"
              value={name}
              onChange={N}
            />
            <fieldset>
              <legend>Дисциплины преподавателя</legend>
              {catalog.subjects
                .filter((s) => s.active || subjects.includes(s.id))
                .map((s) => (
                  <label className="check-line" key={s.id}>
                    <input
                      type="checkbox"
                      checked={subjects.includes(s.id)}
                      onChange={(e) =>
                        S(
                          e.target.checked
                            ? [...subjects, s.id]
                            : subjects.filter((x) => x !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
            </fieldset>
          </>
        ) : (
          <>
            <Field label="Корпус" value={building} onChange={B} />
            <Field label="Номер аудитории" value={number} onChange={Num} />
          </>
        )}
        {(teacher || room) && (
          <label className="check-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => A(e.target.checked)}
            />
            Действующая запись
          </label>
        )}
      </BuilderMutation>
      {(teacher || room) && (
        <button type="button" className="secondary" onClick={reset}>
          Добавить новую запись
        </button>
      )}
    </section>
  );
}
function ResourceFields({
  catalog,
  value,
  onChange,
  locked = false,
}: {
  catalog: Catalog;
  locked?: boolean;
  value: Pick<
    Rule,
    "subjectId" | "teacherId" | "roomId" | "startTime" | "endTime"
  >;
  onChange: (patch: Partial<Rule>) => void;
}) {
  return (
    <>
      {!locked && (
        <>
          <label>
            Дисциплина
            <select
              required
              disabled={locked}
              value={value.subjectId}
              onChange={(e) =>
                onChange({ subjectId: e.target.value, teacherId: null })
              }
            >
              <option value="">Выберите дисциплину</option>
              {catalog.subjects
                .filter((s) => s.active || s.id === value.subjectId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {!s.active ? " (неактивна)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Преподаватель
            <select
              required
              disabled={locked}
              value={value.teacherId ?? ""}
              onChange={(e) => onChange({ teacherId: e.target.value || null })}
            >
              <option value="">Выберите преподавателя</option>
              {catalog.teachers
                .filter(
                  (t) =>
                    t.id === value.teacherId ||
                    (t.active && t.subjectIds.includes(value.subjectId)),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {!t.active ? " (неактивен)" : ""}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <label>
        Аудитория
        <select
          required
          value={value.roomId ?? ""}
          onChange={(e) => onChange({ roomId: e.target.value || null })}
        >
          <option value="">Выберите аудиторию</option>
          {catalog.rooms
            .filter((r) => r.active || r.id === value.roomId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.building} · {r.number}
                {!r.active ? " (неактивна)" : ""}
              </option>
            ))}
        </select>
      </label>
      <QuickResource kind="room" onCreated={(id) => onChange({ roomId: id })} />
      <div className="time-fields">
        <ScheduleField
          label="Начало занятия"
          kind="time"
          required
          value={value.startTime}
          onValueChange={(v) => onChange({ startTime: v })}
        />
        <ScheduleField
          label="Конец занятия"
          kind="time"
          required
          value={value.endTime}
          onValueChange={(v) => onChange({ endTime: v })}
        />
      </div>
    </>
  );
}
export function ScheduleBuilder({
  catalog,
  initialSemester = "",
  initialProgram = "",
  initialDay = "",
  initialGroup = "",
  initialDraft = "",
  workspace = false,
  methods,
}: {
  /** Выбор «вручную / из таблицы» — сразу после настройки семестра. */
  methods?: ReactNode;
  catalog: Catalog;
  initialSemester?: string;
  initialProgram?: string;
  initialDay?: string;
  initialGroup?: string;
  initialDraft?: string;
  workspace?: boolean;
}) {
  const [semesterId, S] = useState(initialSemester),
    [programId, P] = useState(initialProgram),
    [facultyId, F] = useState(
      catalog.faculties.find((f) =>
        f.programs.some((p) => p.id === initialProgram),
      )?.id ?? "",
    ),
    [course, Course] = useState(""),
    [mode, M] = useState(initialGroup ? "ONE" : "ALL"),
    [groupId, G] = useState(initialGroup),
    [mobileGroup, MG] = useState(""),
    [day, D] = useState(initialDay),
    [week, W] = useState<Week | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [selected, Sel] = useState(""),
    [slot, Slot] = useState({
      day: initialDay,
      groupId: initialGroup,
      startTime: "09:00",
      endTime: "10:30",
    }),
    [highlight, H] = useState(""),
    [saved, Saved] = useState(""),
    [newRevision, Rev] = useState(0);
  const sequence = useRef(0),
    semester = catalog.semesters.find((s) => s.id === semesterId),
    programs = catalog.faculties.flatMap((f) =>
      f.programs.map((p) => ({
        ...p,
        facultyId: f.id,
        label: `${f.name} / ${p.name}`,
        available: f.active && p.active,
      })),
    ),
    program = programs.find((p) => p.id === programId),
    groups = (program?.groups ?? []).filter(
      (g) =>
        !course ||
        (course === "unset" ? g.course == null : String(g.course) === course),
    );
  const from = civilDay(day)
    ? monday(day)
    : semester
      ? monday(semester.calendar.start)
      : "";
  async function load(nextDay = day, published?: Preview) {
    if (published) {
      H(published.id);
      Rev((n) => n + 1);
      Saved(
        `Опубликовано занятий: ${published.dates.length}. Группы: ${[...new Set(published.dates.flatMap((d) => d.groups))].join(", ")}. Новые пары выделены в расписании.`,
      );
    }
    const serial = ++sequence.current;
    if (
      !semester ||
      !program ||
      !civilDay(nextDay) ||
      (mode === "ONE" && !groupId)
    ) {
      E("Выберите семестр, направление, дату и группу для подробного режима.");
      return;
    }
    B(true);
    E("");
    Sel("");
    try {
      const params = new URLSearchParams({
        semesterId,
        programId,
        from: monday(nextDay),
        ...(mode === "ONE" ? { groupId } : {}),
      });
      const r = await fetch(`/api/staff/schedule/builder?${params}`, {
        cache: "no-store",
      });
      const data = await r.json();
      if (serial !== sequence.current) return;
      if (!r.ok) {
        E(data.error);
        W(null);
      } else {
        W(data);
        // Keep the choice in the address so a reload reopens the same grid.
        if (workspace)
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}?${new URLSearchParams({
              semesterId,
              programId,
              day: nextDay,
              ...(mode === "ONE" ? { groupId } : {}),
            })}`,
          );
        if (!civilDay(slot.day))
          Slot({
            day:
              nextDay >= semester.calendar.start &&
              nextDay <= semester.calendar.end
                ? nextDay
                : semester.calendar.start,
            groupId:
              mode === "ONE" ? groupId : mobileGroup || groups[0]?.id || "",
            startTime: "09:00",
            endTime: "10:30",
          });
      }
    } catch {
      E("Не удалось загрузить расписание. Повторите попытку.");
    } finally {
      B(false);
    }
  }
  // A reload with a remembered semester/program/day reopens the grid at once.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    // Deferred: field effects may still call invalidate() during mount.
    if (workspace && semester && program && civilDay(day))
      setTimeout(() => void load(), 0);
  }, []);
  function invalidate() {
    Slot({ day: "", groupId: "", startTime: "09:00", endTime: "10:30" });
    ++sequence.current;
    W(null);
    Sel("");
  }
  const chosen = week?.entries.find((e) => e.id === selected);
  const visibleGroup = mode === "ONE" ? groupId : mobileGroup || groups[0]?.id;
  const days = from
    ? Array.from({ length: 7 }, (_, i) => addDays(from, i))
    : [];
  function entryCard(e: Week["entries"][number]) {
    return (
      <button
        type="button"
        className={`timetable-lesson ${e.templateId === highlight ? "is-published" : ""} ${e.status === "CANCELLED" ? "is-cancelled" : ""}`}
        key={e.id}
        onClick={() => {
          Sel(e.id);
          requestAnimationFrame(() =>
            document
              .getElementById("builder-inspector")
              ?.scrollIntoView({ block: "start" }),
          );
        }}
      >
        <span className="tile-time">
          {timeLabel(new Date(e.startsAt), week!.timezone)}–
          {timeLabel(new Date(e.endsAt), week!.timezone)}
        </span>
        <strong>{e.title}</strong>
        <small>{e.teacher ?? "Преподаватель не назначен"}</small>
        <small>{e.room ?? "Аудитория не назначена"}</small>
        {e.groupIds.length > 1 && (
          <span className="badge">Общая · {e.groupIds.length} группы</span>
        )}
        {e.status === "CANCELLED" && <span className="badge">Отменено</span>}
        {e.semesterId !== semesterId && (
          <small>Другой семестр / прежнее занятие</small>
        )}
      </button>
    );
  }
  function dayList(g: string, date: string) {
    const entries =
      week?.entries.filter(
        (e) =>
          e.groupIds.includes(g) &&
          dayKey(new Date(e.startsAt), week.timezone) === date,
      ) ?? [];
    const unavailable =
      !semester ||
      date < semester.calendar.start ||
      date > semester.calendar.end ||
      excluded(date, semester.calendar);
    return (
      <>
        {entries.length ? (
          entries.map(entryCard)
        ) : unavailable ? null : (
          <p className="empty-slot">Занятий нет</p>
        )}
        {unavailable ? (
          <p className="empty-slot is-unavailable">Вне учебных дней</p>
        ) : (
          <button
            type="button"
            className="secondary add-slot"
            aria-label={`Добавить занятие ${displayDate(date)} · ${groups.find((x) => x.id === g)?.name}`}
            onClick={() => {
              Rev((n) => n + 1);
              Sel("");
              Slot({
                day: date,
                groupId: g,
                startTime: "09:00",
                endTime: "10:30",
              });
              requestAnimationFrame(() =>
                document
                  .getElementById("builder-inspector")
                  ?.scrollIntoView({ block: "start" }),
              );
            }}
          >
            + Добавить занятие
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <details
        id="semester-setup"
        className="editor-panel semester-setup"
        open={!catalog.semesters.length}
      >
        <summary>
          <span className="setup-title">
            {semester
              ? `Настройка семестра · ${semester.calendar.name}`
              : "Настроить учебный семестр"}
          </span>
          <span className="setup-badge">Важно</span>
        </summary>
        <SemesterEditor
          key={`${semester?.id ?? "new"}:${semester?.version ?? 0}`}
          semester={semester}
          onCreated={(id, start) => {
            S(id);
            D(start ?? "");
            invalidate();
          }}
        />
        {semester && (
          <div className="semester-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                S("");
                invalidate();
              }}
            >
              Создать другой семестр
            </button>
            <ClearSemester semester={semester} onCleared={invalidate} />
            <DeleteSemester
              semester={semester}
              onDeleted={() => {
                S("");
                invalidate();
              }}
            />
          </div>
        )}
      </details>
      {methods}
      {workspace ? (
        <p className="notice">
          Выберите семестр и направление, затем откройте свободную ячейку.
          Дисциплину, лекцию или семинар можно настроить прямо в форме занятия.
        </p>
      ) : (
        <div className="builder-entrypoints">
          <Link href="/staff/schedule/assignments">
            1. Настроить дисциплину и группы
          </Link>
          <a href="#builder-filters">2. Добавить занятие в расписание</a>
        </div>
      )}
      <form
        id="builder-filters"
        className="builder-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Семестр
          <select
            required
            value={semesterId}
            onChange={(e) => {
              S(e.target.value);
              const s = catalog.semesters.find((s) => s.id === e.target.value);
              D(s?.calendar.start ?? "");
              invalidate();
            }}
          >
            <option value="">Выберите семестр явно</option>
            {catalog.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.calendar.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Факультет
          <select
            required
            value={facultyId}
            onChange={(e) => {
              F(e.target.value);
              P("");
              Course("");
              G("");
              MG("");
              invalidate();
            }}
          >
            <option value="">Выберите факультет</option>
            {catalog.faculties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {!f.active ? " (неактивен)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Направление
          <select
            required
            disabled={!facultyId}
            value={programId}
            onChange={(e) => {
              P(e.target.value);
              Course("");
              G("");
              MG("");
              invalidate();
            }}
          >
            <option value="">Выберите направление</option>
            {programs
              .filter((p) => p.facultyId === facultyId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.available ? " (неактивно)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label>
          Курс
          <select
            value={course}
            disabled={!programId}
            onChange={(e) => {
              Course(e.target.value);
              G("");
              MG("");
              invalidate();
            }}
          >
            <option value="">Все курсы</option>
            {[
              ...new Set(
                (program?.groups ?? [])
                  .map((g) => g.course)
                  .filter((c) => c != null),
              ),
            ]
              .sort((a, b) => a - b)
              .map((c) => (
                <option key={c} value={c}>
                  {c} курс
                </option>
              ))}
            {(program?.groups ?? []).some((g) => g.course == null) && (
              <option value="unset">Курс не указан</option>
            )}
          </select>
        </label>
        <label>
          Режим конструктора
          <select
            value={mode}
            onChange={(e) => {
              M(e.target.value);
              invalidate();
            }}
          >
            <option value="ALL">Все группы направления</option>
            <option value="ONE">Одна группа — подробное редактирование</option>
          </select>
        </label>
        {mode === "ONE" && (
          <label>
            Группа
            <select
              required
              value={groupId}
              onChange={(e) => {
                G(e.target.value);
                invalidate();
              }}
            >
              <option value="">Выберите группу</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ScheduleField
          label="Дата просмотра расписания"
          required
          broad
          value={day}
          onValueChange={(v) => {
            D(v);
            invalidate();
          }}
        />
        <button disabled={busy}>Показать расписание</button>
      </form>
      <p
        role="status"
        className={error ? "form-message is-error" : "form-message"}
      >
        {error || (busy ? "Загружаем…" : "")}
      </p>
      {!catalog.semesters.length && (
        <p className="notice">
          Сначала <Link href="/staff/schedule/semesters">создайте семестр</Link>
          .
        </p>
      )}
      {semester && (
        <p className="notice">
          {semester.calendar.name} · {displayDate(semester.calendar.start)} —{" "}
          {displayDate(semester.calendar.end)}. Часовой пояс вуза
          {week ? `: ${week.timezone}` : ""}. В сетке также видны прежние
          занятия и занятия других семестров — они участвуют в проверке
          конфликтов.
        </p>
      )}
      {week && semester && program && (
        <>
          <div className="builder-workspace">
            <div className="builder-board">
              <nav className="week-nav" aria-label="Недели конструктора">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const next = addDays(from, -7);
                    D(next);
                    void load(next);
                  }}
                >
                  ← Неделя
                </button>
                <strong>
                  {displayDate(from)} — {displayDate(addDays(from, 6))} ·{" "}
                  {parity(from, semester.calendar.anchor) === "A"
                    ? "Числитель"
                    : "Знаменатель"}
                </strong>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const next = addDays(from, 7);
                    D(next);
                    void load(next);
                  }}
                >
                  Неделя →
                </button>
              </nav>
              <nav className="week-nav" aria-label="Переход по типу недели">
                {(["A", "B"] as const).map((type) => {
                  const start =
                    parity(from, semester.calendar.anchor) === type
                      ? from
                      : addDays(from, 7);
                  return (
                    <button
                      key={type}
                      type="button"
                      className="secondary"
                      onClick={() => {
                        D(start);
                        void load(start);
                      }}
                    >
                      {type === "A" ? "Числитель" : "Знаменатель"} ·{" "}
                      {displayDate(start)}–{displayDate(addDays(start, 6))}
                    </button>
                  );
                })}
              </nav>
              {saved && (
                <p role="status" className="notice">
                  {saved}
                </p>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  Rev((n) => n + 1);
                  Slot({
                    day:
                      civilDay(day) && day >= semester.calendar.start
                        ? day
                        : semester.calendar.start,
                    groupId: visibleGroup,
                    startTime: "09:00",
                    endTime: "10:30",
                  });
                  Sel("");
                  requestAnimationFrame(() => {
                    const panel = document.getElementById("builder-inspector");
                    panel?.scrollIntoView({ block: "start" });
                    panel
                      ?.querySelector<HTMLInputElement>("input, select")
                      ?.focus();
                  });
                }}
              >
                Добавить занятия
              </button>
              <div
                className="program-desktop"
                role="region"
                aria-label="Общее расписание направления"
                tabIndex={0}
              >
                <table className="program-table">
                  <caption>Группы направления: {program.name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Дата</th>
                      {(mode === "ONE"
                        ? groups.filter((g) => g.id === groupId)
                        : groups
                      ).map((g) => (
                        <th scope="col" key={g.id}>
                          {g.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((date) => (
                      <tr key={date}>
                        <th scope="row">
                          {displayDate(date)}
                          <span className="weekday">{weekdayShort(date)}</span>
                          {(date < semester.calendar.start ||
                            date > semester.calendar.end) && (
                            <small>Вне семестра</small>
                          )}
                          {excluded(date, semester.calendar) && (
                            <small>Исключено</small>
                          )}
                        </th>
                        {(mode === "ONE"
                          ? groups.filter((g) => g.id === groupId)
                          : groups
                        ).map((g) => (
                          <td key={g.id}>{dayList(g.id, date)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="program-mobile" aria-label="Расписание по дням">
                {mode === "ALL" && (
                  <label>
                    Группа в мобильном просмотре
                    <select
                      value={visibleGroup ?? ""}
                      onChange={(e) => MG(e.target.value)}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {days.map((date) => (
                  <section className="mobile-timetable-day" key={date}>
                    <h3>
                      {displayDate(date)} ({weekdayShort(date)}) ·{" "}
                      {parity(date, semester.calendar.anchor) === "A"
                        ? "Числитель"
                        : "Знаменатель"}
                    </h3>
                    {(date < semester.calendar.start ||
                      date > semester.calendar.end) && (
                      <p>Вне семестра — публикация недоступна</p>
                    )}
                    {excluded(date, semester.calendar) && (
                      <p>Исключённый день семестра</p>
                    )}
                    {dayList(visibleGroup, date)}
                  </section>
                ))}
              </div>
            </div>
            <section id="builder-inspector" className="editor-panel">
              <div className="semester-links">
                <h2>{chosen ? "Изменить занятие" : "Добавить занятия"}</h2>
                {chosen && (
                  <button className="secondary" onClick={() => Sel("")}>
                    Добавить новые занятия
                  </button>
                )}
              </div>
              {chosen ? (
                chosen.semesterId && chosen.subjectId ? (
                  <OccurrenceEditor
                    key={`${chosen.id}:${chosen.version}`}
                    entry={chosen}
                    week={week}
                    catalog={catalog}
                    reload={() => void load()}
                  />
                ) : (
                  <p>
                    Прежнее занятие сохраняет исходную историю.{" "}
                    <Link
                      href={`/staff/schedule/manual?groupId=${chosen.groupIds[0]}&day=${day}`}
                    >
                      Открыть редактор прежнего расписания
                    </Link>
                    .
                  </p>
                )
              ) : (
                <TemplateEditor
                  readyOnly={workspace}
                  key={`${semester.id}:${program.id}:${mode}:${groupId}:${slot.day}:${slot.groupId}:${newRevision}`}
                  catalog={catalog}
                  semester={semester}
                  programId={program.id}
                  groups={program.groups.filter(
                    (g) => g.active && program.available,
                  )}
                  defaultGroup={
                    slot.groupId || (mode === "ONE" ? groupId : visibleGroup)
                  }
                  slot={slot}
                  initialDraft={initialDraft}
                  viewGroup={mode === "ONE" ? groupId : ""}
                  reload={(p) => void load(day, p)}
                />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
function TemplateEditor({
  readyOnly = false,
  catalog,
  semester,
  programId,
  groups,
  defaultGroup,
  reload,
  template,
  today,
  slot,
  initialDraft,
  viewGroup = "",
}: {
  readyOnly?: boolean;
  catalog: Catalog;
  semester: Catalog["semesters"][number];
  programId: string;
  groups: { id: string; name: string }[];
  defaultGroup?: string;
  reload: (preview?: Preview) => void;
  slot?: { day: string; groupId: string; startTime: string; endTime: string };
  initialDraft?: string;
  viewGroup?: string;
  template?: Week["templates"][number];
  today?: string;
}) {
  const draft = (() => {
    try {
      const r = ruleInput.safeParse(JSON.parse(initialDraft ?? ""));
      return r.success ? r.data : undefined;
    } catch {
      return undefined;
    }
  })();
  const [rule, R] = useState<Rule>(
      template?.rule ??
        draft ?? {
          subjectId: "",
          teacherId: null,
          roomId: null,
          groupIds: defaultGroup ? [defaultGroup] : [],
          recurrence: "ONCE",
          weekday:
            slot && civilDay(slot.day)
              ? ((new Date(slot.day).getUTCDay() + 6) % 7) + 1
              : 1,
          once: slot?.day || semester.calendar.start,
          startTime: slot?.startTime ?? "09:00",
          endTime: slot?.endTime ?? "10:30",
        },
    ),
    [from, F] = useState(today ?? semester.calendar.start),
    [op] = useState(() => crypto.randomUUID()),
    [blockKey, BK] = useState(""),
    [setupOpen, Setup] = useState(false),
    [pendingAssignment, Pending] = useState(""),
    [setupRevision, SetupRev] = useState(0);
  const blocks = assignmentBlocks(
      catalog,
      programId,
      viewGroup || defaultGroup,
    ),
    block = blocks.find((b) => b.key === blockKey);
  // A ready lesson created inline replaces the selection once the refreshed catalog has it.
  const created = pendingAssignment
    ? blocks.find((b) => b.assignment.id === pendingAssignment && !b.reason)
    : undefined;
  if (created) {
    Pending("");
    BK(created.key);
    R({
      ...rule,
      subjectId: created.assignment.subjectId,
      teacherId: created.teacherId,
      groupIds: created.groupIds,
    });
  }
  const returnTo =
    "/staff/schedule/builder?" +
    new URLSearchParams({
      semesterId: semester.id,
      programId,
      day: slot?.day || rule.once,
      ...(viewGroup ? { groupId: viewGroup } : {}),
      draft: JSON.stringify(rule),
    });
  const setupHref =
    "/staff/schedule/assignments?" +
    new URLSearchParams({ programId, returnTo });
  const program = catalog.faculties
    .flatMap((f) => f.programs)
    .find((p) => p.id === programId)!;
  let generated: ReturnType<typeof dates> | undefined;
  try {
    if (ruleInput.safeParse(rule).success)
      generated = dates(semester.calendar, rule);
  } catch {
    /* Server returns the actionable bounds error. */
  }
  return (
    <>
      <p>
        {template
          ? "Изменяются только будущие повторения с выбранной даты. Прошедшие и ручные занятия, включая отмены, сохраняются."
          : "Выберите одну группу или несколько для одной общей лекции. Сначала проверьте все конкретные даты."}
      </p>
      {!template && readyOnly && (
        <details
          open={setupOpen}
          onToggle={(e) => Setup(e.currentTarget.open)}
          className="inline-assignment"
        >
          <summary>
            Нет нужного занятия? Создайте дисциплину, лекцию или семинар
          </summary>
          <AssignmentEditor
            key={setupRevision}
            catalog={catalog}
            program={program}
            back="#builder-inspector"
            onSaved={(id) => {
              Setup(false);
              Pending(id);
              // Fresh editor (and operation id) for the next ready lesson.
              SetupRev((n) => n + 1);
              requestAnimationFrame(() =>
                document
                  .querySelector("#builder-inspector .ready-lessons")
                  ?.scrollIntoView({ block: "start" }),
              );
            }}
          />
        </details>
      )}
      <BuilderMutation
        blocked={readyOnly && !template && !block}
        onSaved={reload}
        command={() =>
          template
            ? {
                action: "TEMPLATE_FUTURE",
                id: template.id,
                version: template.version,
                from,
                rule,
              }
            : {
                action: "TEMPLATE_CREATE",
                operationId: op,
                semesterId: semester.id,
                programId,
                rule: readyOnly && !block ? { ...rule, subjectId: "" } : rule,
                ...(block
                  ? {
                      assignment: {
                        id: block.assignment.id,
                        version: block.assignment.version,
                        ...(block.assignment.kind === "SEMINAR"
                          ? { groupId: block.groupIds[0] }
                          : {}),
                      },
                    }
                  : {}),
              }
        }
      >
        {!template && (
          <section className="ready-lessons">
            <p className="form-step">1 · Какое занятие</p>
            <label>
              Готовая лекция или семинар
              <select
                value={blockKey}
                onChange={(e) => {
                  BK(e.target.value);
                  const b = blocks.find((b) => b.key === e.target.value);
                  if (b)
                    R({
                      ...rule,
                      subjectId: b.assignment.subjectId,
                      teacherId: b.teacherId,
                      groupIds: b.groupIds,
                    });
                }}
              >
                <option value="">Выберите готовое занятие</option>
                {blocks.map((b) => (
                  <option key={b.key} value={b.key} disabled={!!b.reason}>
                    {b.label}
                    {b.reason ? ` — ${b.reason}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {!blocks.length && (
              <p>Для выбранной группы пока нет готовых занятий.</p>
            )}
            {readyOnly ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  Setup(true);
                  requestAnimationFrame(() =>
                    document
                      .querySelector("#builder-inspector .inline-assignment")
                      ?.scrollIntoView({ block: "start" }),
                  );
                }}
              >
                Настроить дисциплину и группы здесь
              </button>
            ) : (
              <Link href={setupHref}>Настроить дисциплину и группы →</Link>
            )}
            {block && (
              <div className="notice">
                <h3>
                  {block.title} ·{" "}
                  {block.assignment.kind === "LECTURE" ? "Лекция" : "Семинар"}
                </h3>
                <p>
                  <strong>
                    {block.assignment.kind === "LECTURE"
                      ? "Общая лекция появится у всех групп:"
                      : "Отдельный семинар для группы:"}
                  </strong>{" "}
                  {block.groupNames.join(", ")}. Преподаватель: {block.teacher}.
                </p>
              </div>
            )}
            {blocks
              .filter((b) => b.reason)
              .map((b) => (
                <p key={b.key}>
                  {b.title} · {b.groupNames.join(", ")}: {b.reason}.{" "}
                  <Link href="/staff/schedule/resources">
                    Проверить преподавателей
                  </Link>
                </p>
              ))}
          </section>
        )}
        {!block && !readyOnly && (
          <fieldset>
            <legend>Участвующие группы</legend>
            {groups.map((g) => (
              <label key={g.id} className="check-line">
                <input
                  type="checkbox"
                  checked={rule.groupIds.includes(g.id)}
                  onChange={(e) =>
                    R({
                      ...rule,
                      groupIds: e.target.checked
                        ? [...rule.groupIds, g.id]
                        : rule.groupIds.filter((x) => x !== g.id),
                    })
                  }
                />
                {g.name}
              </label>
            ))}
          </fieldset>
        )}
        <p className="form-step">2 · Аудитория и время</p>
        <ResourceFields
          catalog={catalog}
          value={rule}
          locked={!!block || (readyOnly && !template)}
          onChange={(patch) => R({ ...rule, ...patch })}
        />
        {readyOnly && !template && !block && (
          <p className="notice">
            Выберите готовую лекцию или семинар выше. При необходимости
            настройте их прямо здесь — публикация доступна после выбора.
          </p>
        )}
        <p className="form-step">3 · Когда и как часто</p>
        <p className="footnote">
          Открыта неделя:{" "}
          {slot && civilDay(slot.day)
            ? `${displayDate(monday(slot.day))}–${displayDate(addDays(monday(slot.day), 6))} · ${parity(slot.day, semester.calendar.anchor) === "A" ? "числитель" : "знаменатель"}`
            : "по выбранной дате"}
          .
        </p>
        <label>
          Повторение
          <select
            value={rule.recurrence}
            onChange={(e) =>
              R({ ...rule, recurrence: e.target.value as Rule["recurrence"] })
            }
          >
            <option value="EVERY">Каждую неделю</option>
            <option value="A">По числителю</option>
            <option value="B">По знаменателю</option>
            <option value="ONCE">Однократно</option>
          </select>
        </label>
        {rule.recurrence === "ONCE" ? (
          <ScheduleField
            broad
            required
            label="Дата однократного занятия"
            value={rule.once}
            onValueChange={(v) => R({ ...rule, once: v })}
          />
        ) : (
          <label>
            День недели
            <select
              value={rule.weekday}
              onChange={(e) => R({ ...rule, weekday: Number(e.target.value) })}
            >
              {[
                "Понедельник",
                "Вторник",
                "Среда",
                "Четверг",
                "Пятница",
                "Суббота",
                "Воскресенье",
              ].map((d, i) => (
                <option value={i + 1} key={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        {generated && (
          <section className="placement-summary" aria-label="План размещения">
            <h3>Что появится в расписании</h3>
            <p>
              {catalog.subjects.find((s) => s.id === rule.subjectId)?.name} ·{" "}
              {catalog.teachers.find((t) => t.id === rule.teacherId)?.name ??
                "Преподаватель не назначен"}
            </p>
            <p>
              Группы:{" "}
              {rule.groupIds
                .map((id) => groups.find((g) => g.id === id)?.name ?? id)
                .join(", ")}
            </p>
            <p>
              Повтор:{" "}
              {
                {
                  EVERY: "каждую неделю",
                  A: "только числитель",
                  B: "только знаменатель",
                  ONCE: "разово",
                }[rule.recurrence]
              }
              . {rule.startTime}–{rule.endTime}.
            </p>
            <p>
              Даты:{" "}
              {generated.days.map(displayDate).join(", ") ||
                "Нет подходящих дат — измените день, повторение или границы семестра."}
            </p>
            {!!generated.skipped.length && (
              <p>Исключено: {generated.skipped.map(displayDate).join(", ")}</p>
            )}
            <small>
              Точный план и занятость по всему вузу проверит сервер по кнопке
              ниже.
            </small>
          </section>
        )}
        {template && (
          <ScheduleField
            broad
            required
            label="Изменить будущие начиная с"
            value={from}
            onValueChange={F}
          />
        )}
      </BuilderMutation>
    </>
  );
}
function OccurrenceEditor({
  entry,
  week,
  catalog,
  reload,
}: {
  entry: Week["entries"][number];
  week: Week;
  catalog: Catalog;
  reload: () => void;
}) {
  const [mode, M] = useState("ONE"),
    [day, D] = useState(dayKey(new Date(entry.startsAt), week.timezone)),
    [detach, G] = useState(entry.groupIds[0]),
    [op] = useState(() => crypto.randomUUID()),
    [rule, R] = useState({
      subjectId: entry.subjectId!,
      teacherId: entry.teacherId,
      roomId: entry.roomId,
      startTime: timeLabel(new Date(entry.startsAt), week.timezone),
      endTime: timeLabel(new Date(entry.endsAt), week.timezone),
    });
  const template = week.templates.find((t) => t.id === entry.templateId),
    semester = catalog.semesters.find((s) => s.id === entry.semesterId),
    programs = catalog.faculties.flatMap((f) => f.programs),
    program = programs.find((p) =>
      p.groups.some((g) => g.id === entry.groupIds[0]),
    );
  return (
    <>
      <p>
        {entry.title} ·{" "}
        {entry.groupIds
          .map(
            (id) =>
              programs.flatMap((p) => p.groups).find((g) => g.id === id)
                ?.name ?? "Группа",
          )
          .join(", ")}
      </p>
      {entry.groupIds.length > 1 && (
        <p className="notice">
          Это одна общая лекция. Изменение или отмена применяется ко всем её
          группам. Для независимого занятия явно отделите группу.
        </p>
      )}
      <label>
        Область изменения
        <select value={mode} onChange={(e) => M(e.target.value)}>
          <option value="ONE">Только эту · все участвующие группы</option>
          {template && <option value="FUTURE">Эту и последующие</option>}
          {entry.groupIds.length > 1 && entry.status === "SCHEDULED" && (
            <option value="DETACH">Отделить одну группу</option>
          )}
        </select>
      </label>
      {mode === "FUTURE" && template && semester && program ? (
        <TemplateEditor
          key={`${template.id}:${template.version}`}
          catalog={catalog}
          semester={semester}
          programId={program.id}
          groups={program.groups.filter((g) => g.active)}
          template={template}
          today={dayKey(new Date(entry.startsAt), week.timezone)}
          reload={reload}
        />
      ) : (
        <BuilderMutation
          onSaved={reload}
          command={() =>
            mode === "DETACH"
              ? {
                  action: "DETACH",
                  id: entry.id,
                  version: entry.version,
                  operationId: op,
                  groupId: detach,
                  day,
                  ...rule,
                }
              : {
                  action: "OCCURRENCE_EDIT",
                  id: entry.id,
                  version: entry.version,
                  day,
                  ...rule,
                }
          }
        >
          {mode === "DETACH" && (
            <>
              <label>
                Отделяемая группа
                <select value={detach} onChange={(e) => G(e.target.value)}>
                  {entry.groupIds.map((g) => (
                    <option key={g} value={g}>
                      {program?.groups.find((x) => x.id === g)?.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Независимое занятие должно пройти проверку конфликтов с
                оставшейся общей лекцией. Выберите другое время или ресурсы.
              </p>
            </>
          )}
          <ScheduleField
            broad
            required
            label="Дата отдельного занятия"
            value={day}
            onValueChange={D}
          />
          <ResourceFields
            catalog={catalog}
            value={rule}
            onChange={(patch) => R({ ...rule, ...patch })}
          />
        </BuilderMutation>
      )}
      <details className="occurrence-status">
        <summary>Отмена, восстановление и удаление одного занятия</summary>
        {(entry.status === "CANCELLED"
          ? ["OCCURRENCE_RESTORE", "OCCURRENCE_DELETE"]
          : ["OCCURRENCE_CANCEL", "OCCURRENCE_DELETE"]
        ).map((action) => (
          <section key={action}>
            <h3>
              {action === "OCCURRENCE_RESTORE"
                ? "Восстановить"
                : action === "OCCURRENCE_CANCEL"
                  ? "Отменить"
                  : "Убрать из расписания"}
            </h3>
            <p>
              Применяется ко всем участвующим группам. История и аудит
              сохранятся.
            </p>
            <BuilderMutation
              onSaved={reload}
              command={() => ({
                action: action as
                  | "OCCURRENCE_CANCEL"
                  | "OCCURRENCE_RESTORE"
                  | "OCCURRENCE_DELETE",
                id: entry.id,
                version: entry.version,
              })}
            >
              <p>
                {displayDate(dayKey(new Date(entry.startsAt), week.timezone))} ·{" "}
                {entry.title}
              </p>
            </BuilderMutation>
          </section>
        ))}
      </details>
    </>
  );
}

/** Семестр перед загрузкой таблицы: создать новый, не уходя со страницы импорта. */
export function SemesterQuickSetup({ empty }: { empty: boolean }) {
  const router = useRouter();
  return (
    <details
      id="semester-setup"
      className="editor-panel semester-setup"
      open={empty}
    >
      <summary>
        <span className="setup-title">
          {empty ? "Создайте семестр" : "Новый семестр"}
        </span>
        <span className="setup-badge">Важно</span>
      </summary>
      <SemesterEditor onCreated={() => router.refresh()} />
    </details>
  );
}

/** Удаление пустого семестра: проверка и подтверждение тем же путём, что и правки. */
function DeleteSemester({
  semester,
  onDeleted,
}: {
  semester: Catalog["semesters"][number];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [busy, B] = useState(false),
    [error, E] = useState("");
  return (
    <div className="semester-delete">
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              `Удалить семестр «${semester.calendar.name}»? Это доступно только для семестра без занятий.`,
            )
          )
            return;
          B(true);
          E("");
          try {
            const command = {
              action: "SEMESTER_DELETE" as const,
              id: semester.id,
              version: semester.version,
            };
            const check = await builderRequest({ command, preview: true });
            if (!check.response.ok)
              throw Error(readableBuilderError(check.data.error ?? ""));
            const done = await builderRequest({
              command,
              preview: false,
              token: check.data.token,
              confirmed: true,
            });
            if (!done.response.ok)
              throw Error(readableBuilderError(done.data.error ?? ""));
            onDeleted();
            router.refresh();
          } catch (e) {
            E(
              e instanceof Error && e.message
                ? e.message
                : "Не удалось удалить семестр.",
            );
          } finally {
            B(false);
          }
        }}
      >
        {busy ? "Удаляем…" : "Удалить семестр"}
      </button>
      {error && (
        <p role="alert" className="form-message is-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** «Удалить расписание полностью»: показать число занятий, подтвердить, удалить. */
function ClearSemester({
  semester,
  onCleared,
}: {
  semester: Catalog["semesters"][number];
  onCleared: () => void;
}) {
  const router = useRouter();
  const [busy, B] = useState(false),
    [message, M] = useState(""),
    [ok, K] = useState(false);
  return (
    <div className="semester-clear">
      <button
        type="button"
        className="secondary danger-outline"
        disabled={busy}
        onClick={async () => {
          B(true);
          M("");
          K(false);
          try {
            const command = {
              action: "SEMESTER_CLEAR" as const,
              id: semester.id,
              version: semester.version,
            };
            const check = await builderRequest({ command, preview: true });
            if (!check.response.ok)
              throw Error(readableBuilderError(check.data.error ?? ""));
            const summary = (check.data.warnings ?? [])[0] ?? "";
            if (
              !window.confirm(
                `Удалить всё расписание семестра «${semester.calendar.name}»?
${summary}
Отменить это действие нельзя.`,
              )
            )
              return;
            const done = await builderRequest({
              command,
              preview: false,
              token: check.data.token,
              confirmed: true,
            });
            if (!done.response.ok)
              throw Error(readableBuilderError(done.data.error ?? ""));
            K(true);
            M(
              "Расписание семестра удалено. Его можно составить заново — вручную или из таблицы.",
            );
            onCleared();
            router.refresh();
          } catch (e) {
            M(
              e instanceof Error && e.message
                ? e.message
                : "Не удалось удалить расписание.",
            );
          } finally {
            B(false);
          }
        }}
      >
        {busy ? "Проверяем…" : "Удалить расписание полностью"}
      </button>
      {message && (
        <p
          role={ok ? "status" : "alert"}
          className={`form-message ${ok ? "is-success" : "is-error"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
