"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Tree } from "./structure-forms";

const TERMS = [
  ["1", "1 день"],
  ["2", "2 дня"],
  ["3", "3 дня"],
  ["5", "5 дней"],
  ["NONE", "Бессрочно"],
] as const;

async function send(body: unknown) {
  const r = await fetch("/api/staff/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const result = await r.json().catch(() => ({}));
    throw Error(
      typeof result.error === "string"
        ? result.error
        : "Не удалось сохранить. Проверьте поля и соединение.",
    );
  }
}

/** Новое объявление: кому (каскад до нужного уровня), текст и срок. */
export function AnnouncementForm({ tree }: { tree: Tree }) {
  const router = useRouter();
  const operation = useRef<string | undefined>(undefined);
  const faculties = tree.filter((f) => f.active);
  const [faculty, F] = useState(""),
    [program, P] = useState(""),
    [group, G] = useState(""),
    [term, T] = useState<string>("3"),
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
      ? `всё направление «${programs.find((p) => p.id === program)?.name}»`
      : faculty
        ? `весь факультет «${faculties.find((f) => f.id === faculty)?.name}»`
        : "весь университет";
  return (
    <form
      className="editor-panel announcement-form"
      aria-label="Новое объявление"
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
            body: f.get("body"),
            term,
          });
          operation.current = undefined;
          form.reset();
          K(true);
          M("Объявление опубликовано.");
          router.refresh();
        } catch (err) {
          M(err instanceof Error ? err.message : "Не удалось сохранить.");
        } finally {
          B(false);
        }
      }}
    >
      <h2>Новое объявление</h2>
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
        Заголовок
        <input name="title" required maxLength={120} autoComplete="off" />
      </label>
      <label>
        Текст объявления
        <textarea name="body" required maxLength={2000} rows={4} />
      </label>
      <fieldset className="announcement-term-picker">
        <legend>Срок показа</legend>
        <div className="segmented" role="radiogroup" aria-label="Срок показа">
          {TERMS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={term === value}
              onClick={() => T(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="field-hint">
        После окончания срока объявление исчезнет у студентов и удалится.
      </p>
      <button type="submit" disabled={busy}>
        {busy ? "Публикуем…" : "Опубликовать"}
      </button>
      <p role="status" className={`form-message${ok ? " is-success" : ""}`}>
        {message}
      </p>
    </form>
  );
}

export function DeleteAnnouncement({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, B] = useState(false),
    [error, E] = useState("");
  return (
    <>
      <button
        type="button"
        className="secondary announcement-delete"
        disabled={busy}
        aria-label={`Удалить объявление «${title}»`}
        onClick={async () => {
          if (
            !window.confirm(
              `Удалить объявление «${title}»? Студенты перестанут его видеть.`,
            )
          )
            return;
          B(true);
          E("");
          try {
            await send({ action: "DELETE", id });
            router.refresh();
          } catch (err) {
            E(err instanceof Error ? err.message : "Не удалось удалить.");
            B(false);
          }
        }}
      >
        {busy ? "Удаляем…" : "Удалить"}
      </button>
      {error && (
        <span role="alert" className="announcement-error">
          {error}
        </span>
      )}
    </>
  );
}
