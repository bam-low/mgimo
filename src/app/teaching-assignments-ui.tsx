"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { builderCatalog } from "@/server/semester-builder";
import { BuilderMutation } from "./semester-ui";
import { assignmentBlocks } from "@/lib/teaching-assignment";
type Catalog = Awaited<ReturnType<typeof builderCatalog>>;
export function TeachingAssignments({
  catalog,
  initialProgram = "",
  back,
}: {
  catalog: Catalog;
  initialProgram?: string;
  back: string;
}) {
  const [facultyId, F] = useState(
      catalog.faculties.find((f) =>
        f.programs.some((p) => p.id === initialProgram),
      )?.id ?? "",
    ),
    [programId, P] = useState(initialProgram),
    [edit, E] = useState(""),
    [revision, R] = useState(0);
  const faculty = catalog.faculties.find((f) => f.id === facultyId),
    program = faculty?.programs.find((p) => p.id === programId);
  const blocks = assignmentBlocks(catalog, programId),
    selected = catalog.assignments.find((a) => a.id === edit);
  return (
    <>
      <section className="editor-panel assignment-intro">
        <p className="eyebrow">Шаг 1 / Настройка</p>
        <h2>Одна дисциплина — разные занятия</h2>
        <p>
          Укажите общую лекцию и преподавателей семинаров. Эти настройки можно
          использовать в любом семестре. Уже опубликованные пары не изменятся.
        </p>
        <Link href={back}>Вернуться в выбранный слот конструктора →</Link>
      </section>
      <div className="builder-filters">
        <label>
          Факультет
          <select
            value={facultyId}
            onChange={(e) => {
              F(e.target.value);
              P("");
              E("");
            }}
          >
            <option value="">Выберите факультет</option>
            {catalog.faculties
              .filter((f) => f.active)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Направление
          <select
            value={programId}
            disabled={!facultyId}
            onChange={(e) => {
              P(e.target.value);
              E("");
            }}
          >
            <option value="">Выберите направление</option>
            {faculty?.programs
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {program && (
        <div className="semester-edit-grid assignment-layout">
          <section aria-label="Готовые занятия" className="assignment-list">
            <h2>Готовые занятия</h2>
            {!blocks.length && (
              <p className="notice">
                Для этого направления ещё нет занятий. Начните с настройки
                справа или ниже.
              </p>
            )}
            {catalog.assignments
              .filter((a) => a.programId === programId)
              .map((a) => (
                <article key={a.id} className="semester-card">
                  <span className="badge">
                    {a.kind === "LECTURE"
                      ? "Общая лекция"
                      : "Семинары по группам"}
                  </span>
                  <h3>
                    {catalog.subjects.find((s) => s.id === a.subjectId)?.name}
                  </h3>
                  {blocks
                    .filter((b) => b.assignment.id === a.id)
                    .map((b) => (
                      <div key={b.key}>
                        <p>
                          {b.teacher} · {b.groupNames.join(", ")}
                        </p>
                        {b.reason && (
                          <p className="form-message is-error">{b.reason}</p>
                        )}
                      </div>
                    ))}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => E(a.id)}
                  >
                    Настроить {a.kind === "LECTURE" ? "лекцию" : "семинары"}
                  </button>
                </article>
              ))}
            <button
              type="button"
              onClick={() => {
                E("");
                R((n) => n + 1);
              }}
            >
              Добавить настройку
            </button>
          </section>
          <AssignmentEditor
            key={`${program.id}:${selected?.id ?? revision}:${selected?.version ?? 0}`}
            catalog={catalog}
            program={program}
            selected={selected}
            back={back}
            onSaved={E}
          />
        </div>
      )}
    </>
  );
}
export function AssignmentEditor({
  catalog,
  program,
  selected,
  back,
  onSaved,
}: {
  catalog: Catalog;
  program: Catalog["faculties"][number]["programs"][number];
  selected?: Catalog["assignments"][number];
  back: string;
  onSaved: (id: string) => void;
}) {
  const [subjectId, S] = useState(selected?.subjectId ?? ""),
    [kind, K] = useState<"LECTURE" | "SEMINAR">(
      selected?.kind === "SEMINAR" ? "SEMINAR" : "LECTURE",
    ),
    [rows, R] = useState(selected?.groups ?? []),
    [teacherId, T] = useState(selected?.groups[0]?.teacherId ?? ""),
    [active, A] = useState(selected?.active ?? true),
    [op] = useState(() => crypto.randomUUID());
  const teachers = catalog.teachers.filter(
    (t) => t.active && t.subjectIds.includes(subjectId),
  );
  const groupIds = rows.map((g) => g.groupId);
  return (
    <section className="editor-panel">
      <h2>
        {selected ? "Изменить назначение" : "Настроить дисциплину и группы"}
      </h2>
      {!selected && <NewSubject onCreated={S} />}
      <BuilderMutation
        onSaved={() => onSaved(selected?.id ?? op)}
        command={() => ({
          ...(selected
            ? {
                action: "ASSIGNMENT_EDIT" as const,
                id: selected.id,
                version: selected.version,
                active,
              }
            : { action: "ASSIGNMENT_CREATE" as const, operationId: op }),
          programId: program.id,
          subjectId,
          kind,
          groups: rows.map((g) => ({
            groupId: g.groupId,
            teacherId: kind === "LECTURE" ? teacherId : g.teacherId,
          })),
        })}
      >
        <label>
          Дисциплина
          <select
            required
            disabled={!!selected}
            value={subjectId}
            onChange={(e) => {
              S(e.target.value);
              T("");
              R(rows.map((g) => ({ ...g, teacherId: "" })));
            }}
          >
            <option value="">Выберите дисциплину</option>
            {catalog.subjects
              .filter((s) => s.active || s.id === subjectId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {!s.active ? " (неактивна)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label>
          Вид занятия
          <select
            disabled={!!selected}
            value={kind}
            onChange={(e) => K(e.target.value as typeof kind)}
          >
            <option value="LECTURE">Лекция — общая для выбранных групп</option>
            <option value="SEMINAR">
              Семинар — отдельный для каждой группы
            </option>
          </select>
        </label>
        <fieldset>
          <legend>Группы направления</legend>
          {program.groups.map((g) => (
            <label className="check-line" key={g.id}>
              <input
                type="checkbox"
                disabled={!g.active && !groupIds.includes(g.id)}
                checked={groupIds.includes(g.id)}
                onChange={(e) =>
                  R(
                    e.target.checked
                      ? [...rows, { groupId: g.id, teacherId }]
                      : rows.filter((x) => x.groupId !== g.id),
                  )
                }
              />
              {g.name}
              {!g.active ? " (неактивна)" : ""}
            </label>
          ))}
        </fieldset>
        {kind === "LECTURE" ? (
          <label>
            Преподаватель лекции
            <select
              required
              value={teacherId}
              onChange={(e) => T(e.target.value)}
            >
              <option value="">Выберите преподавателя</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Один преподаватель для выбранных групп
              <select
                value={teacherId}
                onChange={(e) => {
                  T(e.target.value);
                  R(rows.map((g) => ({ ...g, teacherId: e.target.value })));
                }}
              >
                <option value="">Назначить массово</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {rows.map((g) => (
              <label key={g.groupId}>
                Преподаватель семинара ·{" "}
                {program.groups.find((x) => x.id === g.groupId)?.name}
                <select
                  required
                  value={g.teacherId}
                  onChange={(e) =>
                    R(
                      rows.map((x) =>
                        x.groupId === g.groupId
                          ? { ...x, teacherId: e.target.value }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="">Выберите преподавателя</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        )}
        {subjectId && !teachers.length && (
          <p className="notice">
            Нет преподавателя, связанного с дисциплиной.{" "}
            <Link href="/staff/schedule/resources">
              Добавьте связь в справочнике преподавателей
            </Link>
            , затем вернитесь сюда.
          </p>
        )}
        <p className="notice">
          Без назначения:{" "}
          {program.groups
            .filter((g) => g.active && !groupIds.includes(g.id))
            .map((g) => g.name)
            .join(", ") || "все действующие группы выбраны"}
          . Новые группы не добавляются автоматически.
        </p>
        {selected && (
          <label className="check-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => A(e.target.checked)}
            />
            Настройка доступна для новых размещений
          </label>
        )}
        <p>
          {kind === "LECTURE"
            ? "Одно общее занятие для всех выбранных групп."
            : "У каждой группы будет отдельный семинар, даже при одном преподавателе."}{" "}
          Сохранение не публикует занятия в расписании.
        </p>
      </BuilderMutation>
      <Link href={back}>Готово — добавить занятие в расписание →</Link>
    </section>
  );
}
function NewSubject({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, N] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [op] = useState(() => crypto.randomUUID());
  const router = useRouter();
  return (
    <details className="new-subject">
      <summary>Нет дисциплины? Создать по названию</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          B(true);
          E("");
          try {
            const response = await fetch("/api/staff/subjects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "CREATE", operationId: op, name }),
            });
            const data = await response.json();
            if (!response.ok) {
              E(data.error ?? "Не удалось создать дисциплину");
              return;
            }
            router.refresh();
            onCreated(op);
            E("Дисциплина создана. Выберите группы и преподавателя.");
          } catch {
            E(
              "Не удалось создать дисциплину. Ввод сохранён. Обновите страницу перед повтором.",
            );
          } finally {
            B(false);
          }
        }}
      >
        <label>
          Название новой дисциплины
          <input
            required
            maxLength={160}
            value={name}
            onChange={(e) => N(e.target.value)}
          />
        </label>
        <button disabled={busy}>Создать дисциплину</button>
        <p role="status">{error}</p>
      </form>
    </details>
  );
}
