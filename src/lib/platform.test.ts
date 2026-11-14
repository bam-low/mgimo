import { describe, expect, it } from "vitest";
import { platform, platformMetadata } from "./platform";

describe("публичная идентификация платформы", () => {
  it("использует утверждённое рабочее имя в метаданных страницы", () => {
    expect(platform.name).toBe("Кампус");
    expect(platformMetadata.title).toBe(platform.name);
  });

  it("сохраняет предупреждение о вымышленных данных в метаданных", () => {
    expect(platform.disclaimer).toBe("Только вымышленные данные");
    expect(platformMetadata.description).toContain(platform.disclaimer);
    expect(platformMetadata.description).toContain(platform.description);
  });
});
