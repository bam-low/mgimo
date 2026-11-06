// Presentation conversion only. API/DB keep ISO dates and 24-hour local time.
export function displayDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? iso.split("-").reverse().join(".")
    : "";
}
export function parseDate(text: string) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return "";
  const iso = text.split(".").reverse().join("-");
  const parsed = new Date(iso + "T12:00:00Z");
  return iso >= "2000-01-01" &&
    iso <= "2100-12-31" &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}
export function parseTime(text: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}
