import Link from "next/link";
import { ApplicationShell, applicationPageActor } from "./shared";
import { applicationDetail } from "@/server/applications";
import { protectedPage } from "@/server/page";
import { kindLabel, statusLabel } from "@/lib/applications";
import { ApplicationActions, ApplicationUpload } from "../application-forms";
export async function ApplicationDetailPage({
  isStaff,
  id,
  query,
}: {
  isStaff: boolean;
  id: string;
  query: Record<string, string | undefined>;
}) {
  const a = await applicationPageActor(isStaff),
    app = await protectedPage(() =>
      applicationDetail(
        a,
        id,
        Object.fromEntries(Object.entries(query).filter(([, v]) => v)),
      ),
    ),
    base = isStaff ? "/staff/applications" : "/applications";
  const when = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: app.timezone,
        }).format(d)
      : "—";
  const labels: Record<string, string> = {
    APPLICATION_SUBMITTED: "Заявка отправлена",
    APPLICATION_TAKEN: "Принята в работу",
    APPLICATION_COMMENTED: "Комментарий сотрудника",
    APPLICATION_COMPLETED: "Выполнена",
    APPLICATION_REJECTED: "Мотивированный отказ",
    DOCUMENT_UPLOADED: "Документ сохранён",
    DOCUMENT_REPLACED: "Документ заменён",
  };
  return (
    <ApplicationShell isStaff={isStaff}>
      <Link href={base}>← К списку заявок</Link>
      <section className="application-card" aria-label="Карточка заявки">
        <span className="badge">
          {statusLabel[app.status as keyof typeof statusLabel]}
        </span>
        <p className="eyebrow">
          {kindLabel[app.kind as keyof typeof kindLabel]}
        </p>
        <h2>{app.subject}</h2>
        <p>Создана {when(app.createdAt)}</p>
        <p className="footnote">Группа при подаче: {app.submittedGroupName}</p>
        {app.applicant && (
          <div className="notice">
            <strong>{app.applicant.name}</strong>
            <p>
              Текущая группа:{" "}
              {app.applicant.currentGroups.join(", ") ||
                "Нет действующей группы"}
            </p>
            <p>
              Учебный доступ: {app.applicant.eligible ? "действует" : "закрыт"}
            </p>
          </div>
        )}
        {app.purpose && (
          <>
            <h3>Вымышленная цель / место предъявления</h3>
            <p className="application-text">{app.purpose}</p>
          </>
        )}
        {app.description && (
          <>
            <h3>Содержание / пояснение</h3>
            <p className="application-text">{app.description}</p>
          </>
        )}
        {app.responseText && (
          <section className="notice">
            <h3>
              {app.status === "REJECTED"
                ? "Причина отказа"
                : "Ответ сотрудника"}
            </h3>
            <p className="application-text">{app.responseText}</p>
            <p>{when(app.resolvedAt)}</p>
          </section>
        )}
        {app.kind === "STUDY_CERTIFICATE" && (
          <section aria-label="Справка">
            <h3>Демонстрационный документ</h3>
            <p className="badge">
              Образец / Не является официальным документом
            </p>
            {app.currentDocument ? (
              <>
                <p>
                  Версия {app.currentDocument.revision} ·{" "}
                  {app.currentDocument.mediaType} ·{" "}
                  {(app.currentDocument.byteSize / 1024).toFixed(1)} КиБ ·{" "}
                  {when(app.currentDocument.createdAt)}
                </p>
                <a
                  className="application-download"
                  href={
                    isStaff
                      ? `/api/staff/applications/${id}/documents/${app.currentDocument.id}/content`
                      : `/api/applications/${id}/document`
                  }
                  download
                >
                  Скачать справку
                </a>
                <p className="footnote">
                  Откройте скачанный файл системным просмотрщиком. Официальной
                  силы документ не имеет.
                </p>
              </>
            ) : (
              <p>
                {isStaff
                  ? "Готовый файл ещё не сохранён."
                  : "Документ появится после выполнения заявки сотрудником."}
              </p>
            )}
          </section>
        )}
      </section>
      {isStaff && (
        <div className="application-work">
          <ApplicationActions app={app} />
          <ApplicationUpload app={app} />
        </div>
      )}
      {isStaff && app.documents.length > 0 && (
        <section className="application-card">
          <h2>История версий документа</h2>
          <ol>
            {app.documents.map((d) => (
              <li key={d.id} className="document-version">
                <strong>Версия {d.revision}</strong> · {when(d.createdAt)} ·{" "}
                {(d.byteSize / 1024).toFixed(1)} КиБ
                {d.replacementReason && <p>{d.replacementReason}</p>}
                <a
                  href={`/api/staff/applications/${id}/documents/${d.id}/content`}
                  download
                >
                  Скачать версию {d.revision}
                </a>
              </li>
            ))}
          </ol>
          {app.nextDocument && (
            <Link
              href={{
                pathname: `${base}/${id}`,
                query: { documentCursor: app.nextDocument },
              }}
            >
              Предыдущие версии
            </Link>
          )}
        </section>
      )}
      <section className="application-card" aria-label="История обработки">
        <h2>История обработки</h2>
        <ol className="application-events">
          {app.events.map((e) => (
            <li key={e.id} data-testid="application-event">
              <strong>{labels[e.eventType] ?? "Событие заявки"}</strong>
              <p>
                {when(e.createdAt)}
                {e.fromStatus !== e.toStatus && e.toStatus
                  ? ` · ${statusLabel[e.toStatus as keyof typeof statusLabel]}`
                  : ""}
              </p>
              {e.publicText && (
                <p className="application-text">{e.publicText}</p>
              )}
            </li>
          ))}
        </ol>
        {app.nextEvent && (
          <Link
            href={{
              pathname: `${base}/${id}`,
              query: { eventCursor: app.nextEvent },
            }}
          >
            Предыдущие события
          </Link>
        )}
      </section>
    </ApplicationShell>
  );
}
