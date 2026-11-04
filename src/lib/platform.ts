export const platform = {
  name: "Кампус",
  description: "Платформа для университетов. Первый технический этап разработки.",
  disclaimer: "Концепт, не официальный сервис",
  status: "Технический фундамент",
} as const;

export const platformMetadata = {
  title: platform.name,
  description: `${platform.description} ${platform.disclaimer}.`,
};
