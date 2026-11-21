"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  portfolioActivities,
  portfolioCategories,
  portfolioEventTypes,
  portfolioFormats,
  portfolioLevels,
  portfolioOrganizerTypes,
  portfolioParticipants,
} from "@/lib/portfolio";
import { Icon } from "./ui-icon";

const MAX_PDF = 3 * 1024 * 1024;
const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, text]) => (
    <option key={value} value={value}>
      {text}
    </option>
  ));

async function postJSON(url: string, body: unknown) {
  const r = await fetch(url, {
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

type Organizer = { key: number; type: string; name: string };

/** «Добавить работу»: один PDF и сведения о достижении. */
export function PortfolioAdd({ today, full }: { today: string; full: boolean }) {
  const router = useRouter();
  const operation = useRef<string | undefined>(undefined);
  const nextKey = useRef(1);
  const [open, O] = useState(false),
    [file, F] = useState<File | null>(null),
    [organizers, R] = useState<Organizer[]>([{ key: 0, type: "", name: "" }]),
    [busy, B] = useState(false),
    [progress, P] = useState(0),
    [message, M] = useState(""),
    [ok, K] = useState(false);
  if (!open)
    return (
      <div className="portfolio-add-start">
        <button
          type="button"
          onClick={() => {
            O(true);
            M("");
          }}
          disabled={full}
        >
          <Icon name="plus" />
          Добавить работу
        </button>
        {full && (
          <p className="footnote">
            Достигнут предел в 20 работ. Удалите ненужную работу «Только для
            вас».
          </p>
        )}
        {ok && message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="editor-panel portfolio-form"
      aria-label="Сведения о достижении"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form),
          submitter = (e.nativeEvent as SubmitEvent).submitter as
            | HTMLButtonElement
            | null,
          mode = submitter?.value === "PRIVATE" ? "PRIVATE" : "PENDING";
        K(false);
        if (!file) return M("Выберите файл PDF с подтверждением достижения.");
        if (file.size > MAX_PDF) return M("Файл больше 3 МБ. Сожмите PDF.");
        if (!/\.pdf$/i.test(file.name))
          return M("Допустим только файл PDF с расширением .pdf.");
        const metadata = {
          operationId: (operation.current ??= crypto.randomUUID()),
          mode,
          category: f.get("category"),
          eventDate: f.get("eventDate"),
          activity: f.get("activity"),
          comment: f.get("comment") ?? "",
          title: f.get("title"),
          format: f.get("format"),
          eventType: f.get("eventType"),
          rulesUrl: f.get("rulesUrl") ?? "",
          participants: f.get("participants"),
          eventUrl: f.get("eventUrl") ?? "",
          level: f.get("level"),
          organizers: organizers
            .filter((o) => o.name.trim())
            .map((o) => ({ type: o.type, name: o.name })),
          demoConfirmed: f.get("demo") === "on",
        };
        const body = new FormData();
        body.append("metadata", JSON.stringify(metadata));
        body.append("file", file);
        const request = new XMLHttpRequest();
        request.open("POST", "/api/portfolio");
        request.withCredentials = true;
        B(true);
        P(0);
        M("");
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            P(Math.floor((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          B(false);
          let d: { error?: string };
          try {
            d = JSON.parse(request.responseText);
          } catch {
            d = {};
          }
          if (request.status === 200) {
            operation.current = undefined;
            form.reset();
            F(null);
            R([{ key: 0, type: "", name: "" }]);
            O(false);
            K(true);
            M(
              mode === "PENDING"
                ? "Работа отправлена на модерацию. Решение деканата придёт в уведомлениях."
                : "Работа сохранена. Она видна только вам и не учитывается вузом.",
            );
            router.refresh();
          } else
            M(
              d.error ??
                (request.status === 413
                  ? "Файл слишком большой: допустимо до 3 МБ."
                  : "Не удалось сохранить работу. Попробуйте ещё раз."),
            );
        };
        request.onerror = request.onabort = () => {
          B(false);
          M("Передача прервана. Проверьте соединение и попробуйте ещё раз.");
        };
        request.send(body);
      }}
    >
      <div className="portfolio-form-head">
        <h2>Новая работа</h2>
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
        <label className="import-file" data-filled={file ? "" : undefined}>
          <span className="import-file-label">Подтверждающий документ (PDF)</span>
          <span className="import-file-drop">
            <span className="import-file-button">
              <Icon name="document" />
              {file ? "Выбрать другой файл" : "Выбрать файл"}
            </span>
            <span className="import-file-name">
              {file
                ? `${file.name} · ${(file.size / 1024).toFixed(0)} КБ`
                : "Один файл PDF до 3 МБ и до 10 страниц"}
            </span>
          </span>
          <input
            className="import-file-input"
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              F(e.target.files?.[0] ?? null);
              M("");
            }}
          />
        </label>
        <div className="portfolio-fields">
          <label>
            Категория деятельности
            <select name="category" defaultValue="STUDY" required>
              {options(portfolioCategories)}
            </select>
          </label>
          <label>
            Дата мероприятия
            <input
              type="date"
              name="eventDate"
              required
              min="2000-01-01"
              max={today}
            />
          </label>
          <label>
            Вид деятельности
            <select name="activity" defaultValue="" required>
              <option value="" disabled>
                Выберите
              </option>
              {options(portfolioActivities)}
            </select>
          </label>
          <label className="portfolio-wide">
            Наименование мероприятия
            <input
              name="title"
              required
              minLength={3}
              maxLength={200}
              autoComplete="off"
            />
          </label>
          <label>
            Формат мероприятия
            <select name="format" defaultValue="IN_PERSON">
              {options(portfolioFormats)}
            </select>
          </label>
          <label>
            Тип мероприятия
            <select name="eventType" defaultValue="OTHER">
              {options(portfolioEventTypes)}
            </select>
          </label>
          <label>
            Статус мероприятия
            <select name="level" defaultValue="OTHER">
              {options(portfolioLevels)}
            </select>
          </label>
          <label>
            Численность участников
            <select name="participants" defaultValue="UNKNOWN">
              {options(portfolioParticipants)}
            </select>
          </label>
          <label>
            Ссылка на правила
            <input
              type="url"
              name="rulesUrl"
              maxLength={500}
              placeholder="https://"
              inputMode="url"
            />
          </label>
          <label>
            Ссылка на мероприятие
            <input
              type="url"
              name="eventUrl"
              maxLength={500}
              placeholder="https://"
              inputMode="url"
            />
          </label>
        </div>
        <fieldset className="portfolio-organizers">
          <legend>Организаторы</legend>
          {organizers.map((o, i) => (
            <div className="portfolio-organizer-row" key={o.key}>
              <label>
                Тип организатора
                <select
                  value={o.type}
                  required={!!o.name.trim()}
                  onChange={(e) =>
                    R(
                      organizers.map((x) =>
                        x.key === o.key ? { ...x, type: e.target.value } : x,
                      ),
                    )
                  }
                >
                  <option value="">Выберите</option>
                  {options(portfolioOrganizerTypes)}
                </select>
              </label>
              <label>
                Наименование организатора
                <input
                  value={o.name}
                  maxLength={200}
                  minLength={o.name ? 2 : undefined}
                  onChange={(e) =>
                    R(
                      organizers.map((x) =>
                        x.key === o.key ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              {i > 0 && (
                <button
                  type="button"
                  className="secondary portfolio-organizer-remove"
                  aria-label={`Убрать организатора ${i + 1}`}
                  onClick={() => R(organizers.filter((x) => x.key !== o.key))}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
          ))}
          {organizers.length < 3 && (
            <button
              type="button"
              className="portfolio-add-organizer"
              onClick={() =>
                R([...organizers, { key: nextKey.current++, type: "", name: "" }])
              }
            >
              <Icon name="plus" />
              Добавить ещё организатора
            </button>
          )}
        </fieldset>
        <label>
          Комментарий
          <textarea name="comment" rows={2} maxLength={500} />
        </label>
        <label className="check-line">
          <input type="checkbox" name="demo" required />
          Файл демонстрационный: без настоящих документов и персональных данных
        </label>
        {busy && (
          <progress max={100} value={progress} aria-label="Загрузка файла">
            {progress}%
          </progress>
        )}
        <div className="portfolio-submit">
          <button type="submit" name="mode" value="PENDING">
            {busy ? "Сохраняем…" : "Отправить на модерацию"}
          </button>
          <button type="submit" name="mode" value="PRIVATE" className="secondary">
            Сохранить без модерации
          </button>
        </div>
        <p className="footnote">
          Без модерации работа видна только вам и не учитывается вузом. Её
          можно отправить в деканат позже.
        </p>
      </fieldset>
      {message && (
        <p className={ok ? "notice" : "notice error-notice"} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

/** Кнопки студента под своей работой. */
export function OwnPortfolioActions({
  id,
  status,
  version,
  title,
}: {
  id: string;
  status: string;
  version: number;
  title: string;
}) {
  const router = useRouter();
  const [busy, B] = useState(false),
    [message, M] = useState("");
  if (status !== "PRIVATE" && status !== "REJECTED") return null;
  async function act(action: "SUBMIT" | "DELETE") {
    if (
      action === "DELETE" &&
      !confirm(`Удалить работу «${title}»? Файл будет удалён без возможности восстановления.`)
    )
      return;
    B(true);
    M("");
    try {
      await postJSON("/api/portfolio/action", {
        action,
        id,
        expectedVersion: version,
      });
      router.refresh();
    } catch (e) {
      M(e instanceof Error ? e.message : "Не удалось выполнить действие.");
    } finally {
      B(false);
    }
  }
  return (
    <>
      <button type="button" disabled={busy} onClick={() => act("SUBMIT")}>
        {status === "REJECTED" ? "Отправить повторно" : "Отправить на модерацию"}
      </button>
      {status === "PRIVATE" && (
        <button
          type="button"
          className="secondary danger"
          disabled={busy}
          onClick={() => act("DELETE")}
        >
          Удалить
        </button>
      )}
      {message && (
        <p className="notice error-notice portfolio-action-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}

/** Решение деканата: комментарий и «Подтвердить» / «Отклонить». */
export function PortfolioDecision({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const router = useRouter();
  const [comment, C] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState("");
  async function decide(action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && comment.trim().length < 3)
      return M("Укажите причину отклонения — студент увидит её в карточке.");
    B(true);
    M("");
    try {
      await postJSON("/api/staff/portfolio", {
        action,
        id,
        expectedVersion: version,
        comment,
      });
      router.refresh();
    } catch (e) {
      M(e instanceof Error ? e.message : "Не удалось сохранить решение.");
      B(false);
    }
  }
  return (
    <div className="portfolio-decision">
      <label>
        Комментарий для студента
        <textarea
          rows={2}
          maxLength={500}
          value={comment}
          onChange={(e) => C(e.target.value)}
          placeholder="Обязателен при отклонении"
        />
      </label>
      <div className="portfolio-submit">
        <button type="button" disabled={busy} onClick={() => decide("APPROVE")}>
          <Icon name="check" />
          Подтвердить
        </button>
        <button
          type="button"
          className="secondary danger"
          disabled={busy}
          onClick={() => decide("REJECT")}
        >
          Отклонить
        </button>
      </div>
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
