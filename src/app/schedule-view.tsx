"use client";
import { ScheduleField } from "./schedule-field";
import { LessonFlags } from "./lesson-flags";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "./ui-icon";
import { CampusScene, PHASES, phaseAt, type DayPhase } from "./campus-scene";
import { BrandLoader } from "./brand-loader";
import { HelpTip } from "./help-tip";
import { useEffect, useState, type ReactNode } from "react";
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
export function ScheduleView({
  home = false,
  name = "",
  overview,
  notice,
  study,
  initialView = "today",
  initialDay = "",
}: {
  home?: boolean;
  name?: string;
  overview?: ReactNode;
  /** Блок объявлений сразу под приветствием (главная). */
  notice?: ReactNode;
  study?: { faculty: string; program: string; group: string };
  initialView?: "today" | "week";
  initialDay?: string;
}) {
  const [view, V] = useState(initialView),
    [day, D] = useState(initialDay),
    [focusToday, FocusToday] = useState(initialView === "week" && !initialDay);
  const [data, S] = useState<Data | null>(null),
    [now, N] = useState(0),
    [error, E] = useState(""),
    [retry, R] = useState(0),
    [chosenPhase, setPhase] = useState<DayPhase | null>(null);
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
  // Week view: bring today's day into view after «К сегодняшнему дню» or opening the week.
  useEffect(() => {
    if (!focusToday || !data || view !== "week" || home) return;
    FocusToday(false);
    requestAnimationFrame(() =>
      document
        .getElementById(`day-${data.today}`)
        ?.scrollIntoView({ block: "start" }),
    );
  }, [focusToday, data, view, home]);
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
  const phase: DayPhase =
    chosenPhase ?? (data && now ? phaseAt(now, data.timezone) : "day");
  const greeting =
    PHASES.find((p) => p.id === phase)?.greeting ?? "Здравствуйте";
  const planned = data?.lessons.filter((l) => l.status === "SCHEDULED") ?? [];
  const nextId = planned
    .filter((l) => Date.parse(l.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]?.id;
  return (
    <section
      aria-label="Расписание студента"
      className={home ? "student-home" : "student-schedule"}
    >
      {home ? (
        <header className="student-greeting">
          <div className="greeting-copy">
            <p className="eyebrow">
              {data ? formatDate(data.today) : "Ваш учебный день"}
            </p>
            <h1>
              {greeting},
              <br /> <em>{name || "студент"}!</em>
            </h1>
            {study && (
              <p
                className="study-context"
                title={`${study.faculty} · ${study.program} · ${study.group}`}
              >
                <span>{study.faculty}</span>
                <span>{study.program}</span>
                <strong>{study.group}</strong>
              </p>
            )}
            {!data && <p>Загружаем ваш университетский день</p>}
          </div>
          <figure className="greeting-scene">
            <CampusScene phase={phase} />
            <div className="phase-row">
              <HelpTip
                text={`Оформление изменяется в зависимости от реального часового пояса университета. Часовой пояс сейчас: ${data?.timezone ?? "Europe/Moscow"}. Кнопки «Утро · День · Вечер · Ночь» демонстрационные: они меняют только рисунок. Демонстрационный проект — не является настоящим сервисом вуза.`}
              />
              <div
                className="phase-switch"
                role="group"
                aria-label="Время суток на иллюстрации"
              >
                {PHASES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={phase === p.id}
                    onClick={() => setPhase(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </figure>
        </header>
      ) : (
        <header className="editorial-heading">
          <p className="eyebrow">Мой кампус / Учёба</p>
          <h1>Расписание</h1>
          <p>{data ? data.groupName : "Групповой учебный день и неделя"}</p>
        </header>
      )}
      {home && notice}
      {!home && (
        <div className="schedule-controls student-controls">
          <div className="segmented" aria-label="Вид расписания">
            <button
              aria-pressed={view === "today"}
              onClick={() => {
                S(null);
                V("today");
              }}
            >
              День
            </button>
            <button
              aria-pressed={view === "week"}
              onClick={() => {
                S(null);
                V("week");
                FocusToday(true);
              }}
            >
              Неделя
            </button>
          </div>
          <ScheduleField
            broad
            label="Дата"
            value={day || data?.today || ""}
            onValueChange={(value) => {
              S(null);
              D(value);
            }}
          />
          <div className="date-arrows">
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
              <span aria-hidden="true">‹</span>
              <span className="sr-only">Назад</span>
            </button>
            <button
              className="secondary"
              onClick={() => {
                D("");
                R((v) => v + 1);
                S(null);
                FocusToday(true);
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
              <span aria-hidden="true">›</span>
              <span className="sr-only">Вперёд</span>
            </button>
          </div>
        </div>
      )}
      {error ? (
        <div role="alert" className="notice error-notice">
          <Icon name="close" />
          <p>{error}</p>
          <button onClick={() => R((v) => v + 1)}>Повторить</button>
          <Link href="/cabinet">Проверить профиль</Link>
        </div>
      ) : !data ? (
        <BrandLoader
          className="schedule-loading"
          title="Загружаем актуальное расписание…"
          hint="Проверяем ваше прикрепление и время университета."
        />
      ) : (
        <div className={home ? "student-layout" : ""}>
          <div className="student-main">
            {home && state && (
              <section
                className="day-status"
                aria-label="Текущее состояние дня"
              >
                {state.state === "current" ? (
                  <>
                    <div className="current-card-top">
                      <span className="live-label" role="status">
                        <span />
                        Сейчас идёт
                      </span>
                      <span className="current-times">
                        {timeLabel(
                          new Date(state.lesson.startsAt),
                          data.timezone,
                        )}{" "}
                        —{" "}
                        {timeLabel(
                          new Date(state.lesson.endsAt),
                          data.timezone,
                        )}
                      </span>
                    </div>
                    <div className="current-content">
                      <div>
                        <LessonFlags
                          lesson={state.lesson}
                          timezone={data.timezone}
                        />
                        <h2>{state.lesson.title}</h2>
                        <div className="lesson-meta">
                          {state.lesson.room && (
                            <span>
                              <Icon name="room" />
                              Аудитория {state.lesson.room}
                            </span>
                          )}
                          {state.lesson.teacher && (
                            <span>
                              <Icon name="user" />
                              {state.lesson.teacher}
                            </span>
                          )}
                        </div>
                      </div>
                      <Image
                        src="/design/study-desk.svg"
                        alt=""
                        width={96}
                        height={80}
                        className="study-illustration"
                      />
                    </div>
                    <div className="progress-heading">
                      <span>
                        <Icon name="clock" />
                        Осталось {state.remaining} мин
                      </span>
                      <strong>{Math.floor(state.progress)}%</strong>
                    </div>
                    <progress
                      aria-label="Прогресс текущей пары"
                      aria-valuetext={`${Math.floor(state.progress)}%, до конца ${state.remaining} минут`}
                      max={100}
                      value={state.progress}
                    />
                    <Link className="card-action" href="/schedule">
                      <Icon name="calendar" />
                      Открыть расписание
                      <Icon name="arrow" />
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="eyebrow" role="status">
                      Ваш учебный день
                    </span>
                    <h2>
                      {state.state === "empty"
                        ? "Сегодня занятий нет"
                        : state.state === "before"
                          ? "Учебный день впереди"
                          : state.state === "break"
                            ? "Сейчас перемена"
                            : "Все пары на сегодня закончились"}
                    </h2>
                    <p>
                      {state.state === "empty"
                        ? "Посвятите время самостоятельной работе и отдыху."
                        : "Все занятия дня остаются в списке ниже."}
                    </p>
                    <Link className="card-action" href="/schedule?view=week">
                      <Icon name="calendar" />
                      Посмотреть неделю
                      <Icon name="arrow" />
                    </Link>
                  </>
                )}
              </section>
            )}
            <div
              className={
                view === "week" && !home ? "week-days" : "today-agenda"
              }
            >
              {days.map((date) => {
                const lessons = data.lessons.filter(
                  (l) => dayKey(new Date(l.startsAt), data.timezone) === date,
                );
                return (
                  <section
                    className={`schedule-day${!home && date === data.today ? " is-today" : ""}`}
                    id={home ? undefined : `day-${date}`}
                    key={date}
                  >
                    <header>
                      <div>
                        <h2>
                          {home ? "Сегодня в расписании" : formatDate(date)}
                        </h2>
                      </div>
                      {!home && date === data.today ? (
                        <span className="badge">Сегодня</span>
                      ) : null}
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
                              now < Date.parse(l.endsAt),
                            completed =
                              l.status === "SCHEDULED" &&
                              now >= Date.parse(l.endsAt);
                          return (
                            <li
                              key={l.id}
                              className={`lesson ${l.kind === "EXAM" ? "is-exam" : ""} ${l.moved ? "is-moved" : ""} ${current ? "is-current" : ""} ${completed ? "is-completed" : ""} ${l.status === "CANCELLED" ? "is-cancelled" : ""}`}
                            >
                              <div className="lesson-time">
                                <time dateTime={l.startsAt}>
                                  {timeLabel(
                                    new Date(l.startsAt),
                                    data.timezone,
                                  )}
                                </time>
                                <time dateTime={l.endsAt}>
                                  {timeLabel(new Date(l.endsAt), data.timezone)}
                                </time>
                              </div>
                              <div className="lesson-detail">
                                <LessonFlags lesson={l} timezone={data.timezone} />
                                <h3>{l.title}</h3>
                                {l.room && <p>Аудитория {l.room}</p>}
                                {l.teacher && <p>{l.teacher}</p>}
                              </div>
                              {l.status === "CANCELLED" ? (
                                <span className="badge">Отменено</span>
                              ) : current ? (
                                <span className="badge">Сейчас</span>
                              ) : completed ? (
                                <span className="lesson-state">
                                  <Icon name="check" />
                                  <span>Завершено</span>
                                </span>
                              ) : l.id === nextId ? (
                                <span className="badge badge-muted">
                                  Следующее
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="footnote schedule-footnote">
              Время университета: {data.timezone}. Обновление каждые 30 секунд и
              при возвращении на страницу. Демонстрационный проект — не является
              настоящим сервисом вуза.
            </p>
          </div>
          {home && (
            <aside className="student-aside" aria-label="Мой кампус">
              {overview}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
