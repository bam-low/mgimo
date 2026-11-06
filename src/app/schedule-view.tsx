"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  dayKey,
  addDays,
  currentLesson,
  timeLabel,
  type Lesson,
} from "@/lib/schedule-time";
type Data = {
  groupId: string;
  groupName: string;
  timezone: string;
  today: string;
  from: string;
  view: string;
  serverNow: string;
  lessons: Lesson[];
};
export function ScheduleView({ home = false }: { home?: boolean }) {
  const [view, V] = useState("today"),
    [day, D] = useState("");
  const [data, S] = useState<Data | null>(null),
    [now, N] = useState(0),
    [error, E] = useState(""),
    [retry, R] = useState(0);
  useEffect(() => {
    let current = true,
      controller: AbortController | undefined,
      sequence = 0,
      clock:
        | { base: number; elapsed: number; zone: string; day: string }
        | undefined;
    async function load(clear = false) {
      const generation = ++sequence;
      controller?.abort();
      controller = new AbortController();
      if (clear) S(null);
      try {
        const query = new URLSearchParams({
          view: home ? "today" : view,
          ...(day && !home ? { day } : {}),
        });
        const r = await fetch("/api/schedule?" + query, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok)
          throw Error(
            r.status === 401 || r.status === 403
              ? "Доступ изменился. Проверьте прикрепление в профиле."
              : "Не удалось обновить расписание. Проверьте соединение.",
          );
        const result: Data = await r.json();
        if (!current || generation !== sequence) return;
        clock = {
          base: Date.parse(result.serverNow),
          elapsed: performance.now(),
          zone: result.timezone,
          day: result.today,
        };
        N(clock.base);
        S(result);
        E("");
      } catch (e) {
        if (
          current &&
          generation === sequence &&
          !(e instanceof DOMException && e.name === "AbortError")
        ) {
          S(null);
          E(e instanceof Error ? e.message : "Расписание недоступно");
        }
      }
    }
    void load(true);
    const tick = setInterval(() => {
      if (clock) {
        const instant = clock.base + performance.now() - clock.elapsed;
        N(instant);
        if (dayKey(new Date(instant), clock.zone) !== clock.day) {
          clock.day = dayKey(new Date(instant), clock.zone);
          void load(true);
        }
      }
    }, 1000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
      else {
        ++sequence;
        controller?.abort();
        S(null);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      ++sequence;
      controller?.abort();
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
    // data is intentionally not a dependency: changing it must not restart polling.
  }, [day, view, home, retry]);
  const days = data
    ? Array.from({ length: home || view === "today" ? 1 : 7 }, (_, i) =>
        addDays(data.from, i),
      )
    : [];
  const formatDate = (d: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));
  const state = data
    ? currentLesson(
        data.lessons.filter(
          (l) => dayKey(new Date(l.startsAt), data.timezone) === data.today,
        ),
        now,
      )
    : null;
  return (
    <section aria-label="Расписание студента">
      <header className="editorial-heading">
        <p className="eyebrow">{home ? "Мой день" : "Учебная неделя"}</p>
        <h1>{home ? "Сегодня в кампусе" : "Расписание"}</h1>
        <p>
          {data ? `${data.groupName} · ${data.timezone}` : "Время университета"}
        </p>
      </header>
      {!home && (
        <div className="schedule-controls">
          <div className="segmented" aria-label="Вид расписания">
            <button
              aria-pressed={view === "today"}
              onClick={() => {
                S(null);
                V("today");
              }}
            >
              Сегодня / день
            </button>
            <button
              aria-pressed={view === "week"}
              onClick={() => {
                S(null);
                V("week");
              }}
            >
              Неделя
            </button>
          </div>
          <label>
            Дата
            <input
              type="date"
              value={day || data?.today || ""}
              onChange={(e) => {
                S(null);
                D(e.target.value);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="secondary"
              disabled={!data}
              onClick={() => {
                if (data) {
                  D(addDays(data.from, view === "week" ? -7 : -1));
                  S(null);
                }
              }}
            >
              Назад
            </button>
            <button
              className="secondary"
              onClick={() => {
                D("");
                R((v) => v + 1);
                S(null);
              }}
            >
              К сегодняшнему дню
            </button>
            <button
              className="secondary"
              disabled={!data}
              onClick={() => {
                if (data) {
                  D(addDays(data.from, view === "week" ? 7 : 1));
                  S(null);
                }
              }}
            >
              Вперёд
            </button>
          </div>
        </div>
      )}
      {error ? (
        <div role="alert" className="notice">
          <p>{error}</p>
          <button onClick={() => R((v) => v + 1)}>Повторить</button>
          <Link href="/cabinet">Проверить профиль</Link>
        </div>
      ) : !data ? (
        <p role="status" className="notice">
          Загружаем актуальное расписание…
        </p>
      ) : (
        <>
          {home && state && (
            <div className="day-status" role="status">
              {state.state === "current" ? (
                <>
                  <span className="eyebrow">Идёт пара</span>
                  <h2>{state.lesson.title}</h2>
                  <p>
                    До конца: {state.remaining} мин ·{" "}
                    {Math.floor(state.progress)}%
                  </p>
                  <progress
                    aria-label="Прогресс текущей пары"
                    max={100}
                    value={state.progress}
                  />
                </>
              ) : (
                <h2>
                  {state.state === "empty"
                    ? "Сегодня занятий нет"
                    : state.state === "before"
                      ? "Учебный день впереди"
                      : state.state === "break"
                        ? "Сейчас перемена"
                        : "Все пары на сегодня закончились"}
                </h2>
              )}
            </div>
          )}
          {days.map((date) => {
            const lessons = data.lessons.filter(
              (l) => dayKey(new Date(l.startsAt), data.timezone) === date,
            );
            return (
              <section className="schedule-day" key={date}>
                <header>
                  <h2>{formatDate(date)}</h2>
                  {date === data.today && (
                    <span className="badge">Сегодня</span>
                  )}
                </header>
                {!lessons.length ? (
                  <p className="empty-day">
                    Занятий нет. Время для самостоятельной работы и отдыха.
                  </p>
                ) : (
                  <ol className="lesson-list">
                    {lessons.map((l) => {
                      const current =
                        l.status === "SCHEDULED" &&
                        Date.parse(l.startsAt) <= now &&
                        now < Date.parse(l.endsAt);
                      return (
                        <li
                          key={l.id}
                          className={`lesson ${current ? "is-current" : ""} ${l.status === "CANCELLED" ? "is-cancelled" : ""}`}
                        >
                          <div className="lesson-time">
                            <time dateTime={l.startsAt}>
                              {timeLabel(new Date(l.startsAt), data.timezone)}
                            </time>
                            <span>—</span>
                            <time dateTime={l.endsAt}>
                              {timeLabel(new Date(l.endsAt), data.timezone)}
                            </time>
                          </div>
                          <div className="lesson-detail">
                            <h3>{l.title}</h3>
                            {l.room && <p>Аудитория {l.room}</p>}
                            {l.teacher && <p>{l.teacher}</p>}
                          </div>
                          {l.status === "CANCELLED" ? (
                            <span className="badge">Отменено</span>
                          ) : current ? (
                            <span className="badge">Сейчас</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
          <p className="footnote">
            Обновляется каждые 30 секунд и при возвращении на страницу. Часы —
            по времени сервера.
          </p>
          {home && (
            <Link className="editorial-link" href="/schedule">
              Открыть неделю →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
