import { it, expect } from "vitest";
import { applicationNotificationKind, notificationText } from "./notifications";
it("one public event gives one safe notice; drafts/comments/submissions never announce a certificate", () => {
  expect(
    applicationNotificationKind(
      "APPLICATION_COMPLETED",
      "STUDY_CERTIFICATE",
      "COMPLETED",
    ),
  ).toBe("CERTIFICATE_READY");
  expect(
    applicationNotificationKind(
      "APPLICATION_COMPLETED",
      "GENERAL_REQUEST",
      "COMPLETED",
    ),
  ).toBe("APPLICATION_COMPLETED");
  expect(
    applicationNotificationKind(
      "APPLICATION_TAKEN",
      "GENERAL_REQUEST",
      "IN_PROGRESS",
    ),
  ).toBe("APPLICATION_TAKEN");
  expect(
    applicationNotificationKind(
      "APPLICATION_REJECTED",
      "STUDY_CERTIFICATE",
      "REJECTED",
    ),
  ).toBe("APPLICATION_REJECTED");
  expect(
    applicationNotificationKind(
      "DOCUMENT_REPLACED",
      "STUDY_CERTIFICATE",
      "COMPLETED",
    ),
  ).toBe("CERTIFICATE_UPDATED");
  for (const event of [
    "DOCUMENT_UPLOADED",
    "APPLICATION_COMMENTED",
    "APPLICATION_SUBMITTED",
    "UNKNOWN",
  ])
    expect(
      applicationNotificationKind(event, "STUDY_CERTIFICATE", "IN_PROGRESS"),
    ).toBeUndefined();
  expect(
    applicationNotificationKind(
      "DOCUMENT_REPLACED",
      "STUDY_CERTIFICATE",
      "IN_PROGRESS",
    ),
  ).toBeUndefined();
  expect(() => notificationText("<script>")).toThrow();
});
