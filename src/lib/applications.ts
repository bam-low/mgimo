import { z } from "zod";
export const applicationKinds = [
  "GENERAL_REQUEST",
  "STUDY_CERTIFICATE",
] as const;
export const applicationStatuses = [
  "SUBMITTED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
] as const;
export const kindLabel = {
  GENERAL_REQUEST: "Обращение в деканат",
  STUDY_CERTIFICATE: "Демонстрационная справка об обучении",
};
export const statusLabel = {
  SUBMITTED: "Отправлена",
  IN_PROGRESS: "В работе",
  COMPLETED: "Выполнена",
  REJECTED: "Отказано",
};
export const MAX_DOCUMENT = 3 * 1024 * 1024;
export const MAX_UPLOAD = MAX_DOCUMENT + 64 * 1024;
export const MEMBER_QUOTA = 30 * 1024 * 1024;
export const UNIVERSITY_QUOTA = 300 * 1024 * 1024;
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        ![...v].some(
          (c) =>
            (c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))) ||
            c.charCodeAt(0) === 127,
        ),
      "Недопустимые символы",
    );
export const applicationCreate = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("GENERAL_REQUEST"),
      operationId: z.uuid(),
      subject: text(3, 120),
      description: text(10, 3000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("STUDY_CERTIFICATE"),
      operationId: z.uuid(),
      purpose: text(3, 300),
      description: text(0, 1000),
    })
    .strict(),
]);
const command = {
  operationId: z.uuid(),
  expectedVersion: z.number().int().positive(),
};
export const applicationAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("TAKE"), ...command }).strict(),
  z
    .object({ action: z.literal("COMMENT"), ...command, text: text(1, 4000) })
    .strict(),
  z
    .object({ action: z.literal("COMPLETE"), ...command, text: text(1, 4000) })
    .strict(),
  z
    .object({ action: z.literal("REJECT"), ...command, text: text(10, 2000) })
    .strict(),
]);
export const documentMetadata = z
  .object({
    ...command,
    expectedCurrentDocumentId: z.uuid().nullable(),
    demoConfirmed: z.literal(true),
    reason: text(10, 500).optional(),
  })
  .strict();
export function allowedAction(status: string, action: string) {
  return action === "TAKE"
    ? status === "SUBMITTED"
    : action === "REJECT"
      ? ["SUBMITTED", "IN_PROGRESS"].includes(status)
      : ["COMMENT", "COMPLETE"].includes(action) && status === "IN_PROGRESS";
}
export function documentName(id: string, revision: number, mime: string) {
  return `demo-certificate-${z.uuid().parse(id)}-v${revision}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
}
