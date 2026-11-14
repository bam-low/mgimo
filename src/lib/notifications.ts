/** Only safe server-owned templates, never copies of private domain text. */
export const notificationTitles = {
  ENROLLMENT_APPROVED: "Прикрепление подтверждено",
  ENROLLMENT_REJECTED: "В прикреплении отказано",
  APPLICATION_TAKEN: "Заявка принята в работу",
  APPLICATION_COMPLETED: "Заявка выполнена",
  APPLICATION_REJECTED: "В заявке отказано",
  CERTIFICATE_READY: "Демонстрационная справка готова",
  CERTIFICATE_UPDATED: "Демонстрационная справка обновлена",
} as const;
export type NotificationKind = keyof typeof notificationTitles;
export function applicationNotificationKind(
  event: string,
  kind: string,
  status: string,
): NotificationKind | undefined {
  if (event === "APPLICATION_TAKEN") return "APPLICATION_TAKEN";
  if (event === "APPLICATION_REJECTED") return "APPLICATION_REJECTED";
  if (event === "APPLICATION_COMPLETED")
    return kind === "STUDY_CERTIFICATE"
      ? "CERTIFICATE_READY"
      : "APPLICATION_COMPLETED";
  if (
    event === "DOCUMENT_REPLACED" &&
    kind === "STUDY_CERTIFICATE" &&
    status === "COMPLETED"
  )
    return "CERTIFICATE_UPDATED";
}
export function notificationText(kind: string) {
  if (!Object.hasOwn(notificationTitles, kind))
    throw Error("Неизвестный тип уведомления");
  return notificationTitles[kind as NotificationKind];
}
