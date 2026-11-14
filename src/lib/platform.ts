export const platform = {
  name: "Кампус",
  description: "Расписание, успеваемость и связь с деканатом.",
  disclaimer: "Только вымышленные данные",
  status: "Технический фундамент",
} as const;

export const platformMetadata = {
  title: platform.name,
  description: `${platform.description} ${platform.disclaimer}.`,
};
