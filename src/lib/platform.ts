export const platform = {
  name: "Кампус",
  description: "Конкурсная демонстрация регистрации и кабинетов. Только вымышленные данные.",
  disclaimer: "Конкурсный концепт, не официальный сервис",
  status: "Технический фундамент",
} as const;

export const platformMetadata = {
  title: platform.name,
  description: `${platform.description} ${platform.disclaimer}.`,
};
