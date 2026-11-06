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
    groups: { id: string; name: string; active: boolean; version: number }[];
  }[];
}[];
type RecordData = {
  id: string;
  name: string;
  active: boolean;
  version: number;
};
function StructureForm({
  kind,
  record,
  parents = [],
}: {
  kind: "faculty" | "program" | "group";
  record?: RecordData;
  parents?: { id: string; name: string }[];
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
        const active = f.get("active") === "on";
        if (
          record?.active &&
          !active &&
          !window.confirm(
            "Деактивировать? Учебный доступ связанных студентов закроется, история сохранится.",
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
              name: f.get("name"),
              active,
              ...(record
                ? { id: record.id, version: record.version }
                : kind === "faculty"
                  ? {}
                  : { parentId: f.get("parentId") }),
            }),
          });
          if (!r.ok) throw Error();
          E("Сохранено");
          if (!record) {
            form.reset();
            operation.current = undefined;
          }
          router.refresh();
        } catch {
          E(
            "Не удалось сохранить. Проверьте данные и обновите страницу: возможно, запись уже изменена.",
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
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={record?.active ?? true}
        />
        Активно
      </label>
      <button disabled={busy}>
        {busy ? "Сохраняем…" : record ? "Сохранить изменения" : "Создать"}
      </button>
      <p role="status">{error}</p>
    </form>
  );
}
export function StructureEditor({ tree }: { tree: Tree }) {
  return (
    <>
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
      <h2 className="section-heading">Структура университета</h2>
      {!tree.length && <p>Начните с первого факультета.</p>}
      {tree.map((f) => (
        <section className="structure-branch" key={f.id}>
          <h2>
            {f.name} {!f.active && "· Неактивно"}
          </h2>
          <details>
            <summary>Редактировать факультет</summary>
            <StructureForm key={f.version} kind="faculty" record={f} />
          </details>
          {f.programs.map((p) => (
            <section key={p.id} className="structure-program">
              <h3>
                {p.name} {!p.active && "· Неактивно"}
              </h3>
              <details>
                <summary>Редактировать направление</summary>
                <StructureForm key={p.version} kind="program" record={p} />
              </details>
              <ul>
                {p.groups.map((g) => (
                  <li key={g.id}>
                    <h4>
                      {g.name} {!g.active && "· Неактивно"}
                    </h4>
                    <details>
                      <summary>Редактировать группу</summary>
                      <StructureForm key={g.version} kind="group" record={g} />
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      ))}
    </>
  );
}
