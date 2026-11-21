import { countdownLabel, daysUntil } from "./session";

const HOUR = 3600000;

/**
 * Сколько осталось до срока. Меньше суток — в часах и «срочно»; дальше — в
 * календарных днях вуза. Считается от серверного времени, без гидрационных скачков.
 */
export function deadlineLeft(
  d: { dueAt: string; day: string },
  now: string,
  today: string,
) {
  const ms = Date.parse(d.dueAt) - Date.parse(now);
  if (ms <= 0) return { label: "срок прошёл", urgent: false, past: true };
  if (ms < HOUR) return { label: "меньше часа", urgent: true, past: false };
  if (ms < 24 * HOUR)
    return {
      label: `осталось ${Math.floor(ms / HOUR)} ч`,
      urgent: true,
      past: false,
    };
  return {
    label: countdownLabel(daysUntil(today, d.day)),
    urgent: false,
    past: false,
  };
}

export function shortDate(day: string) {
  return day.split("-").reverse().slice(0, 2).join(".");
}
