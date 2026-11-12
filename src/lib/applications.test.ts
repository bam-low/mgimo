import { expect, it } from "vitest";
import {
  applicationCreate,
  applicationAction,
  documentMetadata,
  allowedAction,
  documentName,
  MAX_DOCUMENT,
} from "./applications";
const operationId = "00000000-0000-4000-8000-000000000043";
it("validates the exact approved forms, blocks identity spoofing and requires replacement attestation", () => {
  expect(
    applicationCreate.safeParse({
      kind: "GENERAL_REQUEST",
      operationId,
      subject: "Демо вопрос",
      description: "Демо учебное обращение",
    }).success,
  ).toBe(true);
  expect(
    applicationCreate.safeParse({
      kind: "STUDY_CERTIFICATE",
      operationId,
      purpose: "Демо место предъявления",
      description: "",
    }).success,
  ).toBe(true);
  for (const patch of [
    { role: "STAFF" },
    { membershipId: "other" },
    { status: "COMPLETED" },
  ])
    expect(
      applicationCreate.safeParse({
        kind: "GENERAL_REQUEST",
        operationId,
        subject: "Демо вопрос",
        description: "Демо учебное обращение",
        ...patch,
      }).success,
    ).toBe(false);
  expect(
    applicationAction.safeParse({
      action: "REJECT",
      operationId,
      expectedVersion: 1,
      text: "Нет",
    }).success,
  ).toBe(false);
  expect(
    documentMetadata.safeParse({
      operationId,
      expectedVersion: 1,
      expectedCurrentDocumentId: null,
      demoConfirmed: false,
    }).success,
  ).toBe(false);
  expect(documentName(operationId, 2, "application/pdf")).toMatch(
    /^demo-certificate-[a-f0-9-]+-v2\.pdf$/,
  );
  expect(MAX_DOCUMENT).toBe(3145728);
});
it("permits only the four-state workflow including early refusal, with no terminal reopen or repeated take", () => {
  const expected: Record<string, string[]> = {
    SUBMITTED: ["TAKE", "REJECT"],
    IN_PROGRESS: ["COMMENT", "COMPLETE", "REJECT"],
    COMPLETED: [],
    REJECTED: [],
  };
  for (const [status, actions] of Object.entries(expected))
    for (const action of [
      "TAKE",
      "COMMENT",
      "COMPLETE",
      "REJECT",
      "CANCEL",
      "REOPEN",
    ])
      expect(allowedAction(status, action)).toBe(actions.includes(action));
});
