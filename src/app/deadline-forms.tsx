"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Tree } from "./structure-forms";

async function send(body: unknown) {
  const r = await fetch("/api/staff/deadlines", {
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

/** Новый дедлайн: кому (каскад), что и до какого времени. */
export function DeadlineForm({ tree, today }: { tree: Tree; today: string }) {
  const router = useRouter();
  const operation = useRef<string | undefined>(undefined);
  const faculties = tree.filter((f) => f.active);
  const [faculty, F] = useState(""),
    [program, P] = useState(""),
    [group, G] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    [ok, K] = useState(false);
  const programs =
    faculties.find((f) => f.id === faculty)?.programs.filter((p) => p.active) ??
    [];
  const groups =
    programs.find((p) => p.id === program)?.groups.filter((g) => g.active) ??
    [];
  const scope = group
    ? "GROUP"
    : program
      ? "PROGRAM"
      : faculty
        ? "FACULTY"
        : "UNIVERSITY";
  const audience = group
    ? `группа ${groups.find((g) => g.id === group)?.name}`
    : program
      ? `направление «${programs.find((p) => p.id === program)?.name}»`
      : faculty
        ? `факультет «${faculties.find((f) => f.id === faculty)?.name}»`
        : "весь университет";
  return (
    <form
      className="editor-panel announcement-form"
      aria-label="Новый дедлайн"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        B(true);
        M("");
        K(false);
        try {
          await send({
            action: "CREATE",
            operationId: (operation.current ??= crypto.randomUUID()),
            scope,
            ...(scope === "UNIVERSITY"
              ? {}
              : { targetId: group || program || faculty }),
            title: f.get("title"),
            body: f.get("body") ?? "",
            day: f.get("day"),
            time: f.get("time"),
          });
          operation.current = undefined;
          form.reset();
          K(true);
          M("Опубликовано. Адресаты получили уведомление.");
          router.refresh();
        } catch (err) {
          M(err instanceof Error ? err.message : "Не удалось сохранить.");
        } finally {
          B(false);
        }
      }}
    >
      <h2>Новый дедлайн</h2>
      <fieldset className="announcement-audience-picker">
        <legend>Кому</legend>
        <label>
          Факультет
          <select
            value={faculty}
            onChange={(e) => {
              F(e.target.value);
              P("");
              G("");
            }}
          >
            <option value="">Весь университет</option>
            {faculties.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Направление
          <select
            value={program}
            disabled={!faculty}
            onChange={(e) => {
              P(e.target.value);
              G("");
            }}
          >
            <option value="">Все направления</option>
            {programs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Группа
          <select
            value={group}
            disabled={!program}
            onChange={(e) => G(e.target.value)}
          >
            <option value="">Все группы</option>
            {groups.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p className="field-hint" aria-live="polite">
        Увидит: {audience}.
      </p>
      <label>
        Что сдать или сделать
        <input name="title" required maxLength={120} autoComplete="off" />
      </label>
      <label>
        Пояснение
        <textarea name="body" maxLength={300} rows={2} />
      </label>
      <div className="deadline-due">
        <label>
          Дата
          <input type="date" name="day" required min={today} />
        </label>
        <label>
          Время
          <input type="time" name="time" required defaultValue="23:59" />
        </label>
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Публикуем…" : "Опубликовать"}
      </button>
      <p role="status" className={`form-message${ok ? " is-success" : ""}`}>
        {message}
      </p>
    </form>
  );
}

export function DeleteDeadline({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, B] = useState(false),
    [message, M] = useState("");
  return (
    <>
      <button
        type="button"
        className="secondary danger"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Отменить дедлайн «${title}»?`)) return;
          B(true);
          M("");
          try {
            await send({ action: "DELETE", id });
            router.refresh();
          } catch (err) {
            M(err instanceof Error ? err.message : "Не удалось отменить.");
            B(false);
          }
        }}
      >
        Отменить
      </button>
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
