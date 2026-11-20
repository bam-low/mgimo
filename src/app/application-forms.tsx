"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applicationCreate,
  applicationAction,
  documentMetadata,
  MAX_DOCUMENT,
} from "@/lib/applications";
import type { applicationDetail } from "@/server/applications";
type Detail = Awaited<ReturnType<typeof applicationDetail>>;
function useMutation(isStaff = false) {
  const router = useRouter(),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    [conflict, C] = useState(false);
  async function send(url: string, data: unknown) {
    B(true);
    M("");
    C(false);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) {
        M(d.error ?? "Не удалось сохранить");
        C(r.status === 409);
        if ([401, 403].includes(r.status) && !isStaff) {
          router.replace("/cabinet");
          router.refresh();
        }
        return null;
      }
      M("Изменения сохранены");
      router.refresh();
      return d;
    } catch {
      M(
        "Нет соединения. Ввод сохранён. Обновите карточку перед повтором, чтобы проверить результат.",
      );
      C(true);
      return null;
    } finally {
      B(false);
    }
  }
  return {
    busy,
    message,
    send,
    error: M,
    conflict,
    refresh: () => router.refresh(),
    router,
  };
}
export function ApplicationForm() {
  const [kind, K] = useState<"GENERAL_REQUEST" | "STUDY_CERTIFICATE">(
      "GENERAL_REQUEST",
    ),
    [subject, S] = useState(""),
    [description, D] = useState(""),
    [purpose, P] = useState(""),
    [op] = useState(() => crypto.randomUUID());
  const m = useMutation();
  return (
    <section id="new-application" className="editor-panel application-compose">
      <h2>Создать заявку</h2>
      <p>
        Только вымышленные данные. Не вводите настоящие ФИО, контакты или
        сведения из документов.
      </p>
      <form
        aria-label="Новая заявка"
        onSubmit={async (e) => {
          e.preventDefault();
          const data =
            kind === "GENERAL_REQUEST"
              ? { kind, subject, description, operationId: op }
              : { kind, purpose, description, operationId: op };
          const v = applicationCreate.safeParse(data);
          if (!v.success) {
            m.error("Проверьте обязательные поля и длину текста.");
            return;
          }
          if (
            !confirm(
              "Отправить заявку в деканат? После отправки исходный текст не редактируется.",
            )
          )
            return;
          const r = await m.send("/api/applications", v.data);
          if (r) m.router.push(`/applications/${r.id}`);
        }}
      >
        <fieldset disabled={m.busy}>
          <div>
            <label htmlFor="application-kind">Тип обращения</label>
            <select
              id="application-kind"
              value={kind}
              onChange={(e) => {
                K(e.target.value as typeof kind);
                D("");
              }}
            >
              <option value="GENERAL_REQUEST">Обращение в деканат</option>
              <option value="STUDY_CERTIFICATE">
                Демонстрационная справка об обучении
              </option>
            </select>
          </div>
          {kind === "GENERAL_REQUEST" ? (
            <label>
              Тема
              <input
                required
                minLength={3}
                maxLength={120}
                value={subject}
                onChange={(e) => S(e.target.value)}
              />
            </label>
          ) : (
            <>
              <p className="notice">
                Вы получите вымышленный файл с маркировкой «Образец / Не
                является официальным документом». Готовность и файл появятся в
                карточке.
              </p>
              <label>
                Вымышленная цель / место предъявления
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={purpose}
                  onChange={(e) => P(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            {kind === "GENERAL_REQUEST"
              ? "Содержание обращения"
              : "Пояснение (необязательно)"}
            <textarea
              required={kind === "GENERAL_REQUEST"}
              minLength={kind === "GENERAL_REQUEST" ? 10 : undefined}
              maxLength={kind === "GENERAL_REQUEST" ? 3000 : 1000}
              rows={6}
              value={description}
              aria-describedby="application-text-hint"
              onChange={(e) => D(e.target.value)}
            />
          </label>
          {/* F13: the rule is visible before sending, not only after an error. */}
          <p className="field-hint" id="application-text-hint">
            {kind === "GENERAL_REQUEST"
              ? `Не меньше 10 символов · сейчас ${description.trim().length}`
              : "Можно оставить пустым"}
          </p>
          <button>{m.busy ? "Отправляем…" : "Отправить заявку"}</button>
        </fieldset>
        <p role="status" className="form-message">
          {m.message}
        </p>
        {m.conflict && (
          <button type="button" className="secondary" onClick={m.refresh}>
            Обновить данные
          </button>
        )}
      </form>
    </section>
  );
}
export function ApplicationActions({ app }: { app: Detail }) {
  const allowed =
    app.status === "SUBMITTED"
      ? ["TAKE", "REJECT"]
      : app.status === "IN_PROGRESS"
        ? ["COMMENT", "COMPLETE", "REJECT"]
        : [];
  const [action, A] = useState(allowed[0] ?? ""),
    [text, T] = useState(""),
    [op, O] = useState(() => crypto.randomUUID()),
    m = useMutation(true);
  const chosen = allowed.includes(action) ? action : allowed[0],
    eligible = app.applicant?.eligible,
    feedback = m.error;
  useEffect(() => {
    // A response can disappear after COMMIT. Only authoritative history may
    // confirm that operation and permit a new UUID; retain the user's draft.
    if (app.events.some((event) => event.id === op)) {
      O(crypto.randomUUID());
      feedback(
        "Действие подтверждено по истории. Проверьте статус и ответ перед новым действием.",
      );
    }
  }, [app.events, op, feedback]);
  if (!allowed.length)
    return (
      <p className="notice">
        Заявка закрыта. Исходный текст и ответ сохранены.
        {app.kind === "STUDY_CERTIFICATE" && app.status === "COMPLETED"
          ? " Документ можно заменить отдельным действием с причиной."
          : ""}
      </p>
    );
  return (
    <section className="editor-panel">
      <h2>Обработка заявки</h2>
      {!eligible && (
        <p className="notice">
          Учебный доступ заявителя сейчас закрыт. История сохранена; доступен
          мотивированный отказ.
        </p>
      )}
      <form
        aria-label="Обработка заявки"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = applicationAction.safeParse({
            action: chosen,
            operationId: op,
            expectedVersion: app.version,
            ...(chosen !== "TAKE" ? { text } : {}),
          });
          if (!v.success) {
            m.error(
              "Проверьте текст: ответ до 4000 символов, причина отказа — от 10 до 2000.",
            );
            return;
          }
          if (
            ["REJECT", "COMPLETE"].includes(chosen) &&
            !confirm(
              chosen === "REJECT"
                ? "Отказать в заявке с указанной причиной?"
                : "Завершить заявку и показать результат студенту?",
            )
          )
            return;
          const r = await m.send(
            `/api/staff/applications/${app.id}/actions`,
            v.data,
          );
          if (r) {
            O(crypto.randomUUID());
            T("");
          }
        }}
      >
        <fieldset disabled={m.busy}>
          <div>
            <label htmlFor="application-action">Действие</label>
            <select
              id="application-action"
              value={chosen}
              onChange={(e) => A(e.target.value)}
            >
              {allowed.map((x) => (
                <option
                  value={x}
                  key={x}
                  disabled={!eligible && x !== "REJECT"}
                >
                  {x === "TAKE"
                    ? "Принять в работу"
                    : x === "COMMENT"
                      ? "Добавить комментарий"
                      : x === "COMPLETE"
                        ? "Выполнить"
                        : "Мотивированный отказ"}
                </option>
              ))}
            </select>
          </div>
          {chosen !== "TAKE" && (
            <label>
              {chosen === "REJECT" ? "Причина отказа" : "Ответ / комментарий"}
              <textarea
                required
                minLength={chosen === "REJECT" ? 10 : 1}
                maxLength={chosen === "REJECT" ? 2000 : 4000}
                rows={5}
                value={text}
                onChange={(e) => T(e.target.value)}
              />
            </label>
          )}
          {chosen === "COMPLETE" &&
            app.kind === "STUDY_CERTIFICATE" &&
            !app.currentDocument && (
              <p className="notice">
                Сначала загрузите и сохраните демонстрационную справку ниже.
              </p>
            )}
          <button
            disabled={
              (!eligible && chosen !== "REJECT") ||
              (chosen === "COMPLETE" &&
                app.kind === "STUDY_CERTIFICATE" &&
                !app.currentDocument)
            }
          >
            {m.busy ? "Сохраняем…" : "Применить действие"}
          </button>
        </fieldset>
        <p role="status" className="form-message">
          {m.message}
        </p>
        {m.conflict && (
          <button type="button" className="secondary" onClick={m.refresh}>
            Обновить карточку, сохранив ответ
          </button>
        )}
      </form>
    </section>
  );
}
export function ApplicationUpload({ app }: { app: Detail }) {
  const router = useRouter(),
    [file, F] = useState<File | null>(null),
    [reason, R] = useState(""),
    [demo, D] = useState(false),
    [busy, B] = useState(false),
    [progress, P] = useState(0),
    [message, M] = useState(""),
    [op, O] = useState(() => crypto.randomUUID()),
    input = useRef<HTMLInputElement>(null),
    xhr = useRef<XMLHttpRequest | null>(null);
  useEffect(
    () => () => {
      xhr.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (app.documents.some((document) => document.id === op)) {
      O(crypto.randomUUID());
      M(
        "Загрузка подтверждена по истории. Проверьте текущую версию; выбранный файл сохранён в форме.",
      );
    }
  }, [app.documents, op]);
  if (
    app.kind !== "STUDY_CERTIFICATE" ||
    !["IN_PROGRESS", "COMPLETED"].includes(app.status)
  )
    return null;
  const replacing = !!app.currentDocument;
  return (
    <section className="editor-panel application-upload">
      <h2>{replacing ? "Заменить справку" : "Загрузить справку"}</h2>
      <p>
        PDF/JPG/PNG до 3 МиБ, PDF до 10 страниц, статичное изображение до 12 Мп.
        Максимум пять версий; все версии учитываются в квотах.
      </p>
      <form
        aria-label="Документ справки"
        onSubmit={(e) => {
          e.preventDefault();
          M("");
          if (!file || !file.size || file.size > MAX_DOCUMENT) {
            M("Выберите файл PDF/JPG/PNG размером до 3 МиБ.");
            return;
          }
          const parsed = documentMetadata.safeParse({
            operationId: op,
            expectedVersion: app.version,
            expectedCurrentDocumentId: app.currentDocumentId,
            demoConfirmed: demo,
            ...(replacing ? { reason } : {}),
          });
          if (!parsed.success) {
            M(
              "Подтвердите демонстрационную маркировку и укажите причину замены (10–500 символов).",
            );
            return;
          }
          if (
            !confirm(
              replacing
                ? `Заменить текущую версию ${app.currentDocument!.revision}? История сохранится; после сохранения студент получит только новый файл.`
                : "Загрузить проверенный вымышленный документ? Это не завершит заявку автоматически.",
            )
          )
            return;
          const body = new FormData();
          body.append("metadata", JSON.stringify(parsed.data));
          body.append("file", file);
          const request = new XMLHttpRequest();
          xhr.current = request;
          request.open("POST", `/api/staff/applications/${app.id}/documents`);
          request.withCredentials = true;
          B(true);
          P(0);
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
              M(
                "Не удалось подтвердить сохранение. Обновите карточку перед повтором.",
              );
              return;
            }
            if (request.status === 200) {
              M(
                app.status === "COMPLETED"
                  ? "Новая версия сохранена. Студенту доступен обновлённый файл; история сохранена."
                  : "Документ сохранён сервером. Проверьте его перед завершением заявки.",
              );
              F(null);
              R("");
              D(false);
              O(crypto.randomUUID());
              if (input.current) input.current.value = "";
              router.refresh();
            } else
              M(d.error ?? "Не удалось сохранить. Прежний документ сохранён.");
          };
          request.onerror = request.onabort = () => {
            B(false);
            M(
              "Передача прервана. Выбранный файл сохранён в форме. Обновите карточку, чтобы проверить результат.",
            );
          };
          request.send(body);
        }}
      >
        <fieldset disabled={busy || !app.applicant?.eligible}>
          <div className="application-file-choice">
            <label htmlFor="application-document-file">
              Демонстрационный файл
            </label>
            <input
              id="application-document-file"
              className="application-native-file"
              ref={input}
              type="file"
              tabIndex={-1}
              aria-describedby="application-file-description"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                F(e.target.files?.[0] ?? null);
                D(false);
                P(0);
                M("");
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => input.current?.click()}
            >
              Выбрать файл
            </button>
            <p
              id="application-file-description"
              className="footnote"
              aria-live="polite"
            >
              {file ? `Выбран файл: ${file.name}` : "Файл не выбран"}
            </p>
          </div>
          {file && (
            <p className="footnote">
              Выбран файл · {(file.size / 1024).toFixed(1)} КиБ
            </p>
          )}
          {replacing && (
            <label>
              Причина замены
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => R(e.target.value)}
                rows={3}
              />
            </label>
          )}
          <label className="check-line">
            <input
              type="checkbox"
              required
              checked={demo}
              onChange={(e) => D(e.target.checked)}
            />
            Я визуально проверил все страницы: данные вымышленные, видна
            маркировка «Образец / Не является официальным документом», нет
            настоящих печатей и подписей.
          </label>
          <button>
            {busy
              ? "Загружаем и проверяем…"
              : replacing
                ? "Сохранить новую версию"
                : "Загрузить документ"}
          </button>
        </fieldset>
        {busy && (
          <div role="status">
            <progress
              aria-label="Передача документа"
              value={progress}
              max={100}
            />
            <p>
              {progress < 100
                ? `Передано ${progress}%`
                : "Передано. Проверяем и сохраняем файл…"}
            </p>
          </div>
        )}
        <p role="status" className="form-message">
          {message}
        </p>
        {message && (
          <button
            type="button"
            className="secondary"
            onClick={() => router.refresh()}
          >
            {file ? "Обновить карточку, сохранив файл" : "Обновить карточку"}
          </button>
        )}
      </form>
    </section>
  );
}
