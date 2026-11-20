import { describe, expect, it } from "vitest";
import { readableBuilderError, weekdayShort } from "./builder-messages";

describe("builder messages stay readable without changing the server contract", () => {
  it("names the weekday of a civil date independent of the device timezone", () => {
    expect(weekdayShort("2026-11-19")).toBe("чт");
    expect(weekdayShort("2026-09-08")).toBe("вт");
    expect(weekdayShort("2037-09-01")).toBe("вт");
    expect(weekdayShort("19.11.2026")).toBe("");
    expect(weekdayShort("")).toBe("");
  });

  it("rewrites each conflict kind with a Russian date and a next step", () => {
    const tail = " Выберите другое время или ресурс.";
    expect(
      readableBuilderError(
        `Конфликт: группа Демо-группа 1 занят(а) 2026-11-19 с 08:30 до 09:50.${tail}`,
      ),
    ).toBe(
      "Пересечение: 19.11.2026 (чт) с 08:30 до 09:50 у группы «Демо-группа 1» уже есть занятие. Сдвиньте время, выберите другой день или аудиторию и проверьте снова — показано первое найденное пересечение.",
    );
    expect(
      readableBuilderError(
        `Конфликт: преподаватель Демо Преподаватель занят(а) 2026-09-08 с 12:00 до 13:00.${tail}`,
      ),
    ).toContain("08.09.2026 (вт) с 12:00 до 13:00 преподаватель «Демо Преподаватель» уже ведёт занятие");
    const room = readableBuilderError(
      `Конфликт: аудитория 305 занят(а) 2026-09-08 с 12:00 до 13:00.${tail}`,
    );
    expect(room).toContain("аудитория 305 уже занята");
    expect(room).not.toContain("2026-09-08");
  });

  it("keeps other messages and only converts ISO dates", () => {
    expect(readableBuilderError("Аудитория уже существует")).toBe(
      "Аудитория уже существует",
    );
    expect(readableBuilderError("Дата 2026-12-31 вне семестра")).toBe(
      "Дата 31.12.2026 вне семестра",
    );
  });
});
