// Instants are supplied by the DB; display always uses the University's IANA zone.
// No schedule intervals, recurrence or guessed local-time-to-UTC rules here.
export function universityDate(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instant);
}
