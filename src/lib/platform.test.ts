import { describe, expect, it } from "vitest";
import { platform, platformMetadata } from "./platform";

describe("публичная идентификация платформы", () => {
  it("использует утверждённое рабочее имя в метаданных страницы", () => {
    expect(platform.name).toBe("Кампус");
    expect(platformMetadata.title).toBe(platform.name);
  });

  it("сохраняет заметное предупреждение о неофициальном концепте и в метаданных", () => {
    expect(platform.disclaimer).toBe("Конкурсный концепт, не официальный сервис");
    expect(platformMetadata.description).toContain(platform.disclaimer);
    expect(platformMetadata.description).toContain(platform.description);
  });
});
