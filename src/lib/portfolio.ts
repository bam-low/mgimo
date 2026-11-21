import { z } from "zod";
import { civil } from "./semester";
import { text } from "./applications";

/** Подписи значений формы «Сведения о достижении». Ключи хранятся в БД. */
export const portfolioCategories = {
  STUDY: "Учебная деятельность",
  RESEARCH: "Научно-исследовательская деятельность",
  SOCIAL: "Общественная деятельность",
  CULTURE: "Культурно-творческая деятельность",
  SPORT: "Спортивная деятельность",
} as const;
export const portfolioActivities = {
  WIN: "Победа в мероприятии",
  PRIZE: "Призовое место",
  PARTICIPATION: "Участие",
  PUBLICATION: "Публикация",
  OTHER: "Иное достижение",
} as const;
export const portfolioFormats = {
  IN_PERSON: "Очный",
  REMOTE: "Заочный",
  ONLINE: "Дистанционный",
  MIXED: "Смешанный",
} as const;
export const portfolioEventTypes = {
  OLYMPIAD: "Олимпиада",
  CONTEST: "Конкурс",
  CONFERENCE: "Конференция",
  COMPETITION: "Соревнование",
  FESTIVAL: "Фестиваль",
  HACKATHON: "Хакатон",
  OTHER: "Иной вид мероприятия",
} as const;
export const portfolioParticipants = {
  UNKNOWN: "Нет информации",
  UP_TO_50: "До 50",
  UP_TO_100: "50–100",
  UP_TO_500: "100–500",
  OVER_500: "Более 500",
} as const;
export const portfolioLevels = {
  OTHER: "Иной",
  UNIVERSITY: "Внутривузовский",
  CITY: "Городской",
  REGIONAL: "Региональный",
  NATIONAL: "Всероссийский",
  INTERNATIONAL: "Международный",
} as const;
export const portfolioOrganizerTypes = {
  EDUCATION: "Образовательная организация",
  GOVERNMENT: "Государственный орган",
  COMMERCIAL: "Коммерческая организация",
  NONPROFIT: "Некоммерческая организация",
  OTHER: "Иной",
} as const;
export const portfolioStatuses = {
  PRIVATE: "Только для вас",
  PENDING: "На модерации",
  APPROVED: "Подтверждено деканатом",
  REJECTED: "Отклонено деканатом",
} as const;
export type PortfolioStatus = keyof typeof portfolioStatuses;

export const PORTFOLIO_MAX_ITEMS = 20;
export const PORTFOLIO_UNIVERSITY_QUOTA = 300 * 1024 * 1024;
export const PORTFOLIO_HINT =
  "Подтверждённые деканатом достижения учитываются при переводе на бюджетное место и назначении повышенной стипендии. Работы «Только для вас» деканат не видит и не учитывает. Демонстрационный проект — не является настоящим сервисом вуза.";

const keys = <T extends Record<string, string>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Ссылка должна начинаться с http:// или https://")
  .transform((v) => v || null);

export const portfolioMetadata = z
  .object({
    operationId: z.uuid(),
    mode: z.enum(["PRIVATE", "PENDING"]),
    category: z.enum(keys(portfolioCategories)),
    eventDate: civil,
    activity: z.enum(keys(portfolioActivities)),
    comment: text(0, 500).transform((v) => v || null),
    title: text(3, 200),
    format: z.enum(keys(portfolioFormats)),
    eventType: z.enum(keys(portfolioEventTypes)),
    rulesUrl: url,
    participants: z.enum(keys(portfolioParticipants)),
    eventUrl: url,
    level: z.enum(keys(portfolioLevels)),
    organizers: z
      .array(
        z
          .object({
            type: z.enum(keys(portfolioOrganizerTypes)),
            name: text(2, 200),
          })
          .strict(),
      )
      .max(3),
    demoConfirmed: z.literal(true),
  })
  .strict();
export type PortfolioMetadata = z.infer<typeof portfolioMetadata>;

export const portfolioStudentAction = z
  .object({
    action: z.enum(["SUBMIT", "DELETE"]),
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const portfolioStaffAction = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    comment: text(0, 500).transform((v) => v || null),
  })
  .strict()
  .refine((v) => v.action !== "REJECT" || (v.comment?.length ?? 0) >= 3, {
    message: "Укажите причину отклонения (3–500 символов).",
    path: ["comment"],
  });

export function portfolioFileName(id: string) {
  return `portfolio-${id.slice(0, 8)}.pdf`;
}
