"use client";
import { useState, useRef } from "react";
import { Icon } from "./ui-icon";
import { useRouter } from "next/navigation";
import {
  dayKey,
  addDays,
  monday,
  timeLabel,
  type Lesson,
} from "@/lib/schedule-time";
export function LessonEditor({
  lessons,
  groupId,
  timezone,
  day,
  from = monday(day),
  today = day,
}: {
  lessons: Lesson[];
  groupId: string;
  timezone: string;
  day: string;
  from?: string;
  today?: string;
}) {
  const [selected, S] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const lesson = lessons.find((l) => l.id === selected);
  async function mutate(payload: unknown) {
    B(true);
    M("");
    try {
      const r = await fetch("/api/staff/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        M(
          r.status === 409
            ? "Конфликт времени или запись уже изменена. Обновите расписание и проверьте интервал."
            : "Не удалось сохранить. Проверьте время, группу и доступность структуры.",
        );
        return false;
      }
      M("Изменения сохранены");
      S("");
      router.refresh();
      return true;
    } catch {
      M(
        "Нет соединения. Изменения не подтверждены. Обновите страницу перед повтором.",
      );
      return false;
    } finally {
      B(false);
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const slots = [
    ...new Set(
      lessons.map(
        (l) =>
          timeLabel(new Date(l.startsAt), timezone) +
          "|" +
          timeLabel(new Date(l.endsAt), timezone),
      ),
    ),
  ].sort();
  function reveal(id: string) {
    S(id);
    M("");
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 900px)").matches)
        inspectorRef.current?.scrollIntoView({
          block: "start",
          behavior: "auto",
        });
      formRef.current
        ?.querySelector<HTMLInputElement>('input[name="title"]')
        ?.focus({ preventScroll: true });
    });
  }
  function cell(l: Lesson) {
    return (
      <button
        data-testid="timetable-lesson"
        type="button"
        className={`timetable-lesson ${selected === l.id ? "is-selected" : ""} ${l.status === "CANCELLED" ? "is-cancelled" : ""}`}
        aria-pressed={selected === l.id}
        aria-label={`Открыть занятие: ${l.title}, ${dayKey(new Date(l.startsAt), timezone)} ${timeLabel(new Date(l.startsAt), timezone)}`}
        onClick={() => reveal(l.id)}
      >
        <span className="timetable-room">
          <Icon name="room" />
          {l.room ? `Ауд. ${l.room}` : "Аудитория не указана"}
        </span>
        <strong>{l.title}</strong>
        {l.teacher && <small>{l.teacher}</small>}
        {l.status === "CANCELLED" && <span className="badge">Отменено</span>}
        {selected === l.id && (
          <span className="selection-label">
            <Icon name="edit" />
            Выбрано
          </span>
        )}
      </button>
    );
  }
  const dateHeading = (date: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  return (
    <div className="staff-schedule-grid">
      <section
        className="timetable-panel"
        aria-label="Занятия выбранной недели"
      >
        <div className="timetable-title">
          <div>
            <p className="eyebrow">Групповое расписание</p>
            <h2>Занятия выбранной недели</h2>
          </div>
          <button
            className="secondary add-lesson"
            type="button"
            onClick={() => reveal("")}
          >
            <Icon name="plus" />
            Новое занятие
          </button>
        </div>
        {!lessons.length ? (
          <div className="empty-day">
            <Icon name="calendar" />
            <h3>Неделя пока свободна</h3>
            <p>
              Добавьте первое занятие в форме. Оно появится у студентов этой
              группы.
            </p>
          </div>
        ) : (
          <>
            <div className="timetable-desktop">
              <table className="timetable">
                <caption className="sr-only">
                  Расписание на неделю {from}, время {timezone}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="time-column">
                      Время
                    </th>
                    {days.map((d) => (
                      <th
                        scope="col"
                        key={d}
                        className={d === today ? "is-today" : ""}
                      >
                        <strong>{dateHeading(d)}</strong>
                        <span>
                          {new Intl.DateTimeFormat("ru-RU", {
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          }).format(new Date(d + "T12:00:00Z"))}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const [start, end] = slot.split("|");
                    return (
                      <tr key={slot}>
                        <th scope="row" className="slot-time">
                          <strong>{start}</strong>
                          <span>{end}</span>
                        </th>
                        {days.map((d) => (
                          <td key={d}>
                            {lessons
                              .filter(
                                (l) =>
                                  dayKey(new Date(l.startsAt), timezone) ===
                                    d &&
                                  timeLabel(new Date(l.startsAt), timezone) ===
                                    start &&
                                  timeLabel(new Date(l.endsAt), timezone) ===
                                    end,
                              )
                              .map((l) => (
                                <div key={l.id}>{cell(l)}</div>
                              ))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="timetable-mobile">
              {days.map((d) => {
                const rows = lessons.filter(
                  (l) => dayKey(new Date(l.startsAt), timezone) === d,
                );
                return (
                  <section className="mobile-timetable-day" key={d}>
                    <h3>
                      {new Intl.DateTimeFormat("ru-RU", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      }).format(new Date(d + "T12:00:00Z"))}
                      {d === today && <span className="badge">Сегодня</span>}
                    </h3>
                    {rows.length ? (
                      <ol>
                        {rows.map((l) => (
                          <li key={l.id}>
                            <div className="mobile-slot-time">
                              {timeLabel(new Date(l.startsAt), timezone)}–
                              {timeLabel(new Date(l.endsAt), timezone)}
                            </div>
                            {cell(l)}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="empty-slot">Занятий нет</p>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="timetable-legend">
              <span>
                <i />
                Запланировано
              </span>
              <span>
                <i className="legend-selected" />
                Выбранное занятие
              </span>
              <p>
                <Icon name="edit" />
                Нажмите на занятие для редактирования
              </p>
            </div>
          </>
        )}
      </section>
      <section
        className="lesson-inspector editor-panel"
        ref={inspectorRef}
        aria-label="Редактор занятия"
      >
        <div className="inspector-heading">
          <span className="eyebrow">
            {lesson ? "Выбранное занятие" : "Добавление занятия"}
          </span>
          {lesson && (
            <button
              className="icon-button"
              type="button"
              aria-label="Закрыть редактирование"
              onClick={() => S("")}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <h2>{lesson ? "Редактировать занятие" : "Новое занятие"}</h2>
        <p className="footnote">
          Только вымышленные данные. Время: {timezone}.
        </p>
        <form
          ref={formRef}
          key={lesson ? `${lesson.id}-${lesson.version}` : "new"}
          aria-label="Занятие"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await mutate({
              action: lesson ? "EDIT" : "CREATE",
              ...(lesson ? { id: lesson.id, version: lesson.version } : {}),
              groupId,
              title: f.get("title"),
              day: f.get("day"),
              start: f.get("start"),
              end: f.get("end"),
              teacher: f.get("teacher"),
              room: f.get("room"),
            });
          }}
        >
          <label>
            Дисциплина
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={lesson?.title}
            />
          </label>
          <label>
            Дата занятия
            <input
              name="day"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required
              defaultValue={
                lesson ? dayKey(new Date(lesson.startsAt), timezone) : day
              }
            />
          </label>
          <div className="time-fields">
            <label>
              Начало
              <input
                type="time"
                name="start"
                required
                defaultValue={
                  lesson
                    ? timeLabel(new Date(lesson.startsAt), timezone)
                    : "09:00"
                }
              />
            </label>
            <label>
              Конец
              <input
                type="time"
                name="end"
                required
                defaultValue={
                  lesson
                    ? timeLabel(new Date(lesson.endsAt), timezone)
                    : "10:30"
                }
              />
            </label>
          </div>
          <label>
            Вымышленный преподаватель (необязательно)
            <input
              name="teacher"
              maxLength={120}
              defaultValue={lesson?.teacher ?? ""}
            />
          </label>
          <label>
            Аудитория (необязательно)
            <input
              name="room"
              maxLength={80}
              defaultValue={lesson?.room ?? ""}
            />
          </label>
          <button disabled={busy}>
            {busy
              ? "Сохраняем…"
              : lesson
                ? "Сохранить занятие"
                : "Создать занятие"}
          </button>
          {lesson && (
            <button className="secondary" type="button" onClick={() => S("")}>
              Отменить редактирование
            </button>
          )}
        </form>

        <p
          role="status"
          className={
            message.startsWith("Конфликт") ||
            message.startsWith("Не ") ||
            message.startsWith("Нет ")
              ? "form-message is-error"
              : "form-message"
          }
        >
          {message}
        </p>
        {lesson && (
          <div className="inspector-actions">
            <p className="inspector-status">
              {lesson.status === "CANCELLED"
                ? "Занятие отменено"
                : "Занятие запланировано"}
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    lesson.status === "CANCELLED"
                      ? "Восстановить занятие? Время будет проверено на пересечения."
                      : "Отменить занятие? Студенты увидят отметку об отмене.",
                  )
                )
                  void mutate({
                    action:
                      lesson.status === "CANCELLED" ? "RESTORE" : "CANCEL",
                    id: lesson.id,
                    version: lesson.version,
                  });
              }}
            >
              {lesson.status === "CANCELLED"
                ? "Восстановить"
                : "Отменить занятие"}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Убрать занятие из расписания? Событие и аудит сохранятся, вернуть через интерфейс нельзя.",
                  )
                )
                  void mutate({
                    action: "DELETE",
                    id: lesson.id,
                    version: lesson.version,
                  });
              }}
            >
              Удалить
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
