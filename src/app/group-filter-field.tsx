"use client";
import { useId, useState } from "react";
export function GroupFilterField({
  groups,
  selected,
}: {
  groups: {
    id: string;
    name: string;
    available: boolean;
    groupName?: string;
  }[];
  selected: string;
}) {
  const id = useId(),
    [value, V] = useState(selected);
  const current = groups.find((g) => g.id === value);
  return (
    <div className="group-filter-field">
      <label htmlFor={id}>Учебная группа</label>
      <select
        id={id}
        name="groupId"
        value={value}
        onChange={(e) => V(e.target.value)}
        aria-describedby={id + "-context"}
      >
        {groups.map((g) => (
          <option value={g.id} key={g.id}>
            {g.groupName ?? g.name}
            {!g.available ? " (неактивна)" : ""}
          </option>
        ))}
      </select>
      <p
        className="filter-context"
        id={id + "-context"}
        data-testid="group-context"
        aria-live="polite"
      >
        {current?.groupName ?? current?.name}
        {current && !current.available ? " · неактивна" : ""}
      </p>
      <details className="group-path">
        <summary>Факультет и направление</summary>
        <p>{current?.name}</p>
      </details>
    </div>
  );
}
