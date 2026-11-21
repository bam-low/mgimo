import { headers } from "next/headers";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { studentSession } from "@/server/session";
import { examKindLabel, countdownLabel } from "@/lib/session";
import { shortDate } from "@/lib/deadlines";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { HelpTip } from "../../help-tip";
import { StudyTabs } from "../../study-tabs";
export const dynamic = "force-dynamic";

function weekday(day: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}

export default async function Page() {
  const data = await protectedPage(async () =>
    studentSession(await actor(await headers())),
  );
  const upcoming = data.items.filter((i) => i.upcoming);
  const rest = data.items.filter((i) => !i.upcoming).reverse();
  const card = (e: (typeof data.items)[number]) => (
    <li
      key={e.id}
      className="exam-card"
      data-status={e.status}
      data-kind={e.kind}
      data-testid="exam"
    >
      <div className="exam-date">
        <strong>{shortDate(e.day)}</strong>
        <span>
          {e.startTime}–{e.endTime}
        </span>
      </div>
      <div className="exam-body">
        <span className="lesson-flags">
          <span className="flag flag-exam">{examKindLabel(e.kind)}</span>
          {e.moved && <span className="flag flag-moved">Перенесено</span>}
          {e.status === "CANCELLED" && <span className="flag">Отменено</span>}
        </span>
        {e.moved && (
          <span className="lesson-was">
            было {shortDate(e.moved.day)}, {e.moved.time}
            {e.moved.room ? ` · ${e.moved.room}` : ""}
          </span>
        )}
        <h3>{e.title}</h3>
        <p>
          {weekday(e.day)} · {e.room} · {e.teacher}
        </p>
      </div>
      <div className="exam-side">
        {e.upcoming ? (
          <span className="exam-left" data-soon={e.days <= 1 ? "" : undefined}>
            {countdownLabel(e.days)}
          </span>
        ) : e.result ? (
          <span
            className="exam-result"
            data-passed={e.result.passed ? "" : undefined}
          >
            {e.result.label}
          </span>
        ) : e.kind !== "CONSULTATION" && e.status === "SCHEDULED" ? (
          <span className="exam-wait">ждёт оценку</span>
        ) : null}
      </div>
    </li>
  );
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/grades" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Учёба</p>
          <h1>Успеваемость</h1>
          <p>Экзамены, зачёты и консультации вашей группы.</p>
        </header>
        <StudyTabs active="session" />
        {data.items.length ? (
          <>
            <div className="session-summary">
              <p>
                Сдано <strong>{data.summary.passed}</strong> из{" "}
                <strong>{data.summary.total}</strong>
              </p>
              <HelpTip
                label="Откуда результат"
                text="Результат — оценка по дисциплине, выставленная в день экзамена или позже. Консультации не оцениваются."
              />
              <progress
                max={Math.max(1, data.summary.total)}
                value={data.summary.passed}
                aria-label="Сдано экзаменов и зачётов"
              />
            </div>
            {upcoming.length > 0 && (
              <section aria-labelledby="session-next">
                <h2 id="session-next" className="section-heading">
                  Впереди
                </h2>
                <ul className="exam-list">{upcoming.map(card)}</ul>
              </section>
            )}
            {rest.length > 0 && (
              <section aria-labelledby="session-done">
                <h2 id="session-done" className="section-heading">
                  Прошедшие
                </h2>
                <ul className="exam-list">{rest.map(card)}</ul>
              </section>
            )}
          </>
        ) : (
          <p className="notice">Расписание сессии пока не опубликовано.</p>
        )}
      </Workspace>
    </main>
  );
}
