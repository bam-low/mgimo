"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
export type Tree = {
  id: string;
  name: string;
  active: boolean;
  version: number;
  programs: {
    id: string;
    name: string;
    active: boolean;
    version: number;
    groups: {
      id: string;
      name: string;
      active: boolean;
      version: number;
      course: number | null;
    }[];
  }[];
}[];
type RecordData = {
  id: string;
  name: string;
  active: boolean;
  version: number;
  course?: number | null;
};
function StructureForm({
  kind,
  record,
  parents = [],
  parentActive = true,
}: {
  kind: "faculty" | "program" | "group";
  record?: RecordData;
  parents?: { id: string; name: string }[];
  parentActive?: boolean;
}) {
  const operation = useRef<string | undefined>(undefined);
  const [busy, B] = useState(false),
    [error, E] = useState(""),
    router = useRouter();
  return (
    <form
      aria-label={
        record
          ? `Изменить ${record.name}`
          : `Добавить ${kind === "faculty" ? "факультет" : kind === "program" ? "направление" : "группу"}`
      }
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const visibility = submitter?.getAttribute("data-visibility");
        const deleting = visibility === "delete";
        if (
          deleting &&
          !window.confirm(
            `Удалить «${record?.name}» без возможности восстановления? Это доступно только при отсутствии связей и истории.`,
          )
        )
          return;
        const active =
          visibility === "archive"
            ? false
            : visibility === "restore"
              ? true
              : (record?.active ?? f.get("active") === "on");
        if (
          visibility === "archive" &&
          !window.confirm(
            `Убрать «${record?.name}» в архив? Связанные студенты потеряют доступ к этой учебной ветке. История сохранится.`,
          )
        )
          return;
        B(true);
        E("");
        try {
          const r = await fetch("/api/staff/structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              ...(!record
                ? { operationId: (operation.current ??= crypto.randomUUID()) }
                : {}),
              name: visibility ? record?.name : f.get("name"),
              active,
              ...(deleting ? { action: "DELETE" } : {}),
              ...(kind === "group"
                ? {
                    course: visibility
                      ? (record?.course ?? null)
                      : f.get("course")
                        ? Number(f.get("course"))
                        : null,
                  }
                : {}),
              ...(record
                ? { id: record.id, version: record.version }
                : kind === "faculty"
                  ? {}
                  : { parentId: f.get("parentId") }),
            }),
          });
          if (!r.ok) {
            const result = await r.json();
            E(
              typeof result.error === "string"
                ? result.error
                : "Не удалось сохранить изменения.",
            );
            return;
          }
          E("Сохранено");
          if (!record) {
            form.reset();
            operation.current = undefined;
          }
          router.refresh();
        } catch {
          E(
            "Не удалось сохранить. Проверьте соединение и обновите страницу: возможно, запись уже изменена.",
          );
        } finally {
          B(false);
        }
      }}
    >
      {!record && kind !== "faculty" && (
        <label>
          {kind === "program" ? "Факультет" : "Направление"}
          <select
            aria-label={kind === "program" ? "Факультет" : "Направление"}
            name="parentId"
            required
          >
            <option value="">Выберите</option>
            {parents.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Вымышленное название
        <input
          name="name"
          defaultValue={record?.name}
          maxLength={120}
          required
        />
      </label>
      {kind === "group" && (
        <label>
          Курс
          <input
            name="course"
            type="number"
            min="1"
            max="2147483647"
            step="1"
            defaultValue={record?.course ?? ""}
            placeholder="Курс не указан"
          />
        </label>
      )}
      {!record && (
        <label className="check-label">
          <input type="checkbox" name="active" defaultChecked />
          Активно
        </label>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Сохраняем…" : record ? "Сохранить изменения" : "Создать"}
      </button>
      {record && (
        <button
          type="submit"
          className="secondary"
          data-visibility={record.active ? "archive" : "restore"}
          formNoValidate
          disabled={busy || (!record.active && !parentActive)}
        >
          {record.active ? "Убрать в архив" : "Восстановить"}
        </button>
      )}
      {record && (
        <button
          type="submit"
          className="danger"
          data-visibility="delete"
          formNoValidate
          disabled={busy}
        >
          Удалить
        </button>
      )}
      <p role="status">{error}</p>
    </form>
  );
}
function StructureTree({
  tree,
  archive = false,
}: {
  tree: Tree;
  archive?: boolean;
}) {
  return tree.map((f) => (
    <section className="structure-branch" key={f.id}>
      <h2>
        {f.name} {!f.active && "· В архиве"}
      </h2>
      {(!archive || !f.active) && (
        <details>
          <summary>Редактировать факультет</summary>
          <StructureForm key={f.version} kind="faculty" record={f} />
        </details>
      )}
      {f.programs.map((p) => (
        <section key={p.id} className="structure-program">
          <h3>
            {p.name} {!p.active && "· В архиве"}
          </h3>
          {(!archive || !p.active || !f.active) && (
            <details>
              <summary>Редактировать направление</summary>
              <StructureForm
                key={p.version}
                kind="program"
                record={p}
                parentActive={f.active}
              />
            </details>
          )}
          <ul>
            {p.groups.map((g) => (
              <li key={g.id}>
                <h4>
                  {g.name} {!g.active && "· В архиве"}
                </h4>
                <span className="group-course">
                  {" "}
                  · {g.course == null ? "Курс не указан" : `${g.course} курс`}
                </span>
                {(!archive || !g.active || !p.active || !f.active) && (
                  <details>
                    <summary>Редактировать группу</summary>
                    <StructureForm
                      key={g.version}
                      kind="group"
                      record={g}
                      parentActive={f.active && p.active}
                    />
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  ));
}

function archivedStructure(tree: Tree): Tree {
  return tree.flatMap((faculty) => {
    if (!faculty.active) return [faculty];
    const programs = faculty.programs.flatMap((program) => {
      if (!program.active) return [program];
      const groups = program.groups.filter((group) => !group.active);
      return groups.length ? [{ ...program, groups }] : [];
    });
    return programs.length ? [{ ...faculty, programs }] : [];
  });
}

export function StructureEditor({ tree }: { tree: Tree }) {
  const active = tree
    .filter((faculty) => faculty.active)
    .map((faculty) => ({
      ...faculty,
      programs: faculty.programs
        .filter((program) => program.active)
        .map((program) => ({
          ...program,
          groups: program.groups.filter((group) => group.active),
        })),
    }));
  const archived = archivedStructure(tree);
  return (
    <>
      <section aria-label="Активная учебная структура">
        <h2 className="section-heading">Структура университета</h2>
        {!active.length && <p>Активных факультетов пока нет.</p>}
        <StructureTree tree={active} />
      </section>
      <h2 className="section-heading">Добавить в структуру</h2>
      <section className="staff-create-grid">
        <div>
          <h2>Новый факультет</h2>
          <StructureForm kind="faculty" />
        </div>
        <div>
          <h2>Новое направление</h2>
          <StructureForm
            kind="program"
            parents={tree.filter((f) => f.active)}
          />
        </div>
        <div>
          <h2>Новая группа</h2>
          <StructureForm
            kind="group"
            parents={tree
              .filter((f) => f.active)
              .flatMap((f) =>
                f.programs
                  .filter((p) => p.active)
                  .map((p) => ({ id: p.id, name: `${f.name} / ${p.name}` })),
              )}
          />
        </div>
      </section>
      <details>
        <summary>Архив учебной структуры</summary>
        <section aria-label="Архив учебной структуры">
          <p>
            Чтобы вернуть вложенную запись, сначала восстановите её родителя.
          </p>
          {!archived.length && <p>В архиве пока ничего нет.</p>}
          <StructureTree tree={archived} archive />
        </section>
      </details>
    </>
  );
}
