// Presentation only: server messages and API dates stay unchanged.
import { displayDate } from "./schedule-input-values";

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function weekdayShort(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? WEEKDAYS_SHORT[new Date(`${day}T00:00:00Z`).getUTCDay()]
    : "";
}

/** Rewrites the builder's terse conflict text for people; other errors keep their text with Russian dates. */
export function readableBuilderError(message: string) {
  const conflict =
    /^Конфликт: (группа|преподаватель|аудитория) (.+?) занят\(а\) (\d{4}-\d{2}-\d{2}) с (\d{1,2}:\d{2}) до (\d{1,2}:\d{2})\./.exec(
      message,
    );
  if (!conflict)
    return message.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3.$2.$1");
  const [, kind, name, day, start, end] = conflict;
  const when = `${displayDate(day)} (${weekdayShort(day)}) с ${start} до ${end}`;
  const who =
    kind === "группа"
      ? `у группы «${name}» уже есть занятие`
      : kind === "преподаватель"
        ? `преподаватель «${name}» уже ведёт занятие`
        : `аудитория ${name} уже занята`;
  return `Пересечение: ${when} ${who}. Сдвиньте время, выберите другой день или аудиторию и проверьте снова — показано первое найденное пересечение.`;
}
