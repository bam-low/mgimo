import { describe, expect, it } from "vitest";
import { displayDate, parseDate, parseTime } from "./schedule-input-values";
describe("Russian schedule field presentation keeps the ISO API contract", () => {
  it("round-trips unambiguous date strings without a device timezone", () => {
    expect(displayDate("2026-11-06")).toBe("06.11.2026");
    expect(parseDate("06.11.2026")).toBe("2026-11-06");
    expect(parseDate("29.02.2028")).toBe("2028-02-29");
    for (const bad of [
      "29.02.2026",
      "31.02.2026",
      "31.04.2026",
      "11/06/2026",
      "2026-11-06",
      "01.01.1999",
      "01.01.2101",
      "",
    ])
      expect(parseDate(bad)).toBe("");
  });
  it("accepts only 24-hour HH:mm with the existing precision", () => {
    for (const value of ["00:00", "09:05", "23:59"])
      expect(parseTime(value)).toBe(value);
    for (const bad of ["11:32 PM", "24:00", "23:60", "9:05", "09:05:00", ""])
      expect(parseTime(bad)).toBe("");
  });
});
