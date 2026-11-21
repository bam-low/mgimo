"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./ui-icon";

type Row = {
  line: number;
  status: "new" | "exists" | "error";
  message?: string;
  groups?: string;
  subject?: string;
  when?: string;
  lessons?: number;
};
type Report = {
  rows: Row[];
  created: number;
  lessons: number;
  existing: number;
  errors: number;
  published: boolean;
  error?: string;
};

/** Excel в русской локали сохраняет CSV в Windows-1251, «CSV UTF-8» — в UTF-8. */
async function readText(file: File) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

const STATUS = {
  new: "Будет создано",
  exists: "Уже есть",
  error: "Ошибка",
} as const;

export function ScheduleImportForm({
  semesters,
}: {
  semesters: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [semesterId, S] = useState(semesters[0]?.id ?? ""),
    [file, F] = useState<File | null>(null),
    [csv, C] = useState(""),
    [report, R] = useState<Report | null>(null),
    [busy, B] = useState<"" | "check" | "publish">(""),
    [message, M] = useState("");
  async function send(confirm: boolean, text = csv) {
    B(confirm ? "publish" : "check");
    M("");
    try {
      const r = await fetch("/api/staff/schedule/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, csv: text, confirm }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw Error(
          typeof data.error === "string"
            ? data.error
            : "Не удалось проверить файл. Попробуйте ещё раз.",
        );
      R(data as Report);
      if ((data as Report).published) router.refresh();
    } catch (e) {
      M(e instanceof Error ? e.message : "Не удалось проверить файл.");
    } finally {
      B("");
    }
  }
  const canPublish =
    report && !report.published && !report.errors && report.created > 0;
  if (!semesters.length)
    return (
      <p className="notice">
        Сначала создайте учебный семестр в{" "}
        <Link href="/staff/schedule#semester-setup">конструкторе</Link>.
      </p>
    );
  return (
    <div className="import-flow">
      <ol className="import-steps">
        <li className="import-step">
          <span className="import-step-n">1</span>
          <div>
            <h2>Семестр</h2>
            <label>
              Учебный семестр
              <select
                value={semesterId}
                onChange={(e) => {
                  S(e.target.value);
                  R(null);
                }}
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </li>
        <li className="import-step">
          <span className="import-step-n">2</span>
          <div>
            <h2>Шаблон</h2>
            <p>
              Таблица с колонками и двумя строками-примерами. Откройте в Excel,
              заполните и сохраните как CSV.
            </p>
            <a
              className="secondary import-template"
              href="/api/staff/schedule/import/template"
              download
            >
              <Icon name="document" /> Скачать шаблон
            </a>
            <p className="field-hint">
              Рекомендуем использовать те же названия, что и в структуре
              университета, если она уже создана: группы, дисциплины,
              преподаватели и аудитории сопоставляются по названию.
            </p>
          </div>
        </li>
        <li className="import-step">
          <span className="import-step-n">3</span>
          <div>
            <h2>Загрузка и проверка</h2>
            <label className="import-file" data-filled={file ? "" : undefined}>
              <span className="import-file-label">Файл расписания (.csv)</span>
              <span className="import-file-drop">
                <span className="import-file-button">
                  <Icon name="document" />
                  {file ? "Выбрать другой файл" : "Выбрать файл"}
                </span>
                <span className="import-file-name">
                  {file ? file.name : "Файл пока не выбран"}
                </span>
              </span>
              <input
                className="import-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  F(f);
                  R(null);
                  M("");
                  if (!f) return C("");
                  if (f.size > 200_000)
                    return M("Файл больше 200 КБ. Разделите его на части.");
                  const text = await readText(f);
                  C(text);
                  await send(false, text);
                }}
              />
            </label>
            {file && (
              <button
                type="button"
                className="secondary"
                disabled={!csv || !!busy}
                onClick={() => send(false)}
              >
                {busy === "check" ? "Проверяем…" : "Проверить ещё раз"}
              </button>
            )}
          </div>
        </li>
      </ol>
      {message && (
        <p role="alert" className="notice" data-tone="error">
          {message}
        </p>
      )}
      {report && (
        <section className="import-report" aria-label="Результат проверки">
          {report.error && (
            <p role="alert" className="notice" data-tone="error">
              {report.error}
            </p>
          )}
          {report.published ? (
            <p role="status" className="form-message is-success">
              Опубликовано: {report.created}{" "}
              {plural(report.created, "занятие", "занятия", "занятий")} в
              расписании ({report.lessons}{" "}
              {plural(report.lessons, "дата", "даты", "дат")}).{" "}
              <Link href="/staff/schedule#builder-filters">
                Открыть конструктор
              </Link>
            </p>
          ) : (
            <div className="import-totals" role="status">
              <div data-tone="new">
                <strong>{report.lessons}</strong>
                <span>
                  {plural(
                    report.lessons,
                    "дата будет создана",
                    "даты будут созданы",
                    "дат будет создано",
                  )}{" "}
                  из {report.created}{" "}
                  {plural(report.created, "строки", "строк", "строк")}
                </span>
              </div>
              <div data-tone="exists">
                <strong>{report.existing}</strong>
                <span>уже есть в семестре</span>
              </div>
              <div data-tone="error">
                <strong>{report.errors}</strong>
                <span>
                  {plural(report.errors, "ошибка", "ошибки", "ошибок")}
                </span>
              </div>
            </div>
          )}
          {report.rows.length > 0 && (
            <ul className="import-rows">
              {report.rows.map((r) => (
                <li key={r.line} data-status={r.status}>
                  <span className="import-row-line">Строка {r.line}</span>
                  <span className="badge" data-status={r.status}>
                    {STATUS[r.status]}
                    {r.status === "new" && r.lessons
                      ? ` · ${r.lessons} ${plural(r.lessons, "дата", "даты", "дат")}`
                      : ""}
                  </span>
                  <strong>
                    {[r.subject, r.groups].filter(Boolean).join(" · ") || "—"}
                  </strong>
                  {r.when && <span className="import-row-when">{r.when}</span>}
                  {r.message && (
                    <span className="import-row-message">{r.message}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!report.published && (
            <div className="import-actions">
              <button
                type="button"
                disabled={!canPublish || !!busy}
                onClick={() => send(true)}
              >
                {busy === "publish"
                  ? "Публикуем…"
                  : report.created
                    ? `Опубликовать ${report.lessons} ${plural(report.lessons, "дату", "даты", "дат")}`
                    : "Нечего публиковать"}
              </button>
              <p className="field-hint">
                {report.errors
                  ? "Исправьте строки с ошибками и загрузите файл снова — публикуется всё или ничего."
                  : "Перед публикацией файл проверяется ещё раз. Строки «уже есть» будут пропущены."}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
