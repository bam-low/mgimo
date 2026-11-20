"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/** A changed group immediately removes the old student and unsaved result. */
export function GradeGroupScope({
  groups,
  groupId,
  history,
  children,
}: {
  groups: { id: string; name: string; context: string; active: boolean }[];
  groupId: string;
  history: boolean;
  children: ReactNode;
}) {
  const [choice, C] = useState(groupId),
    [pending, transition] = useTransition(),
    [ready, R] = useState(false),
    router = useRouter();
  useEffect(() => R(true), []);
  const current = groups.find((g) => g.id === choice);
  function navigate(value: string) {
    C(value);
    // No student, result cursor or roster cursor survives a group change.
    const query = new URLSearchParams({
      ...(value ? { groupId: value } : {}),
      ...(history ? { history: "1" } : {}),
    });
    transition(() =>
      router.push("/staff/grades" + (query.size ? "?" + query : "")),
    );
  }
  return (
    <>
      <form
        method="get"
        className="request"
        aria-label="Фильтр студентов"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(choice);
        }}
      >
        {history && <input type="hidden" name="history" value="1" />}
        <label>
          Группа
          <select
            aria-label="Группа"
            name="groupId"
            value={choice}
            onChange={(e) => navigate(e.target.value)}
          >
            <option value="">
              {history ? "Все группы — история" : "Выберите учебную группу"}
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id} disabled={!history && !g.active}>
                {g.name}
                {!g.active ? " (неактивна)" : ""}
              </option>
            ))}
          </select>
        </label>
        {current && (
          <details className="group-path">
            <summary>Факультет и направление</summary>
            <p>{current.context}</p>
          </details>
        )}
        <button className="secondary" disabled={pending}>
          Показать студентов
        </button>
      </form>
      {pending || choice !== groupId ? (
        <p role="status" className="notice">
          Обновляем список студентов. Предыдущий студент и несохранённый
          результат сброшены.
        </p>
      ) : (
        <fieldset className="grade-scope-content" disabled={!ready}>
          {children}
        </fieldset>
      )}
    </>
  );
}
