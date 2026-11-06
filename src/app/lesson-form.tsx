"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayKey, timeLabel, type Lesson } from "@/lib/schedule-time";
export function LessonEditor({
  lessons,
  groupId,
  timezone,
  day,
}: {
  lessons: Lesson[];
  groupId: string;
  timezone: string;
  day: string;
}) {
  const [selected, S] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    router = useRouter();
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
  return (
    <div className="staff-schedule-grid">
      <section className="editor-panel">
        <h2>{lesson ? "Редактировать занятие" : "Новое занятие"}</h2>
        <p className="footnote">
          Только вымышленные дисциплины, преподаватели и аудитории. Время:{" "}
          {timezone}.
        </p>
        <form
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
        <p role="status">{message}</p>
      </section>
      <section>
        <h2>Занятия выбранной недели</h2>
        {!lessons.length && (
          <p className="empty-day">
            Занятий пока нет. Добавьте первое в форме рядом.
          </p>
        )}
        <ol className="staff-lessons">
          {lessons.map((l) => (
            <li className="editor-panel" key={l.id}>
              <p className="eyebrow">
                {dayKey(new Date(l.startsAt), timezone)} ·{" "}
                {timeLabel(new Date(l.startsAt), timezone)}–
                {timeLabel(new Date(l.endsAt), timezone)}
              </p>
              <h3>{l.title}</h3>
              <p>
                {[l.teacher, l.room && `Аудитория ${l.room}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>{l.status === "CANCELLED" ? "Отменено" : "Запланировано"}</p>
              <div className="row-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    S(l.id);
                    M("");
                  }}
                >
                  Редактировать
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        l.status === "CANCELLED"
                          ? "Восстановить занятие? Время будет проверено на пересечения."
                          : "Отменить занятие? Студенты увидят отметку об отмене.",
                      )
                    )
                      void mutate({
                        action: l.status === "CANCELLED" ? "RESTORE" : "CANCEL",
                        id: l.id,
                        version: l.version,
                      });
                  }}
                >
                  {l.status === "CANCELLED"
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
                        id: l.id,
                        version: l.version,
                      });
                  }}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
