import { ZodError } from "zod";
export class Denied extends Error {
  constructor(public status = 403) {
    super("Действие недоступно. Обновите страницу и попробуйте ещё раз.");
  }
}
function safeCode(e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? e.code : undefined;
  return typeof code === "string" &&
    (/^P\d{4}$/.test(code) ||
      ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"].includes(code))
    ? code
    : undefined;
}
export function reportFailure(e: unknown) {
  const code = safeCode(e);
  // Never print message/cause/stack, SQL, request data, tokens or connection URLs.
  console.error("campus.operation_failed", {
    category: code ? "database" : "unexpected",
    code: code ?? "UNEXPECTED",
  });
}
export function failure(e: unknown) {
  const code = safeCode(e);
  let status: number;
  if (e instanceof Denied) status = e.status;
  else if (e instanceof ZodError || e instanceof SyntaxError) status = 400;
  else if (code && ["P2002", "P2025", "P2034"].includes(code)) status = 409;
  else {
    reportFailure(e);
    status =
      code &&
      [
        "P1001",
        "P1002",
        "P1008",
        "P1017",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ECONNRESET",
      ].includes(code)
        ? 503
        : 500;
  }
  return Response.json(
    {
      error:
        e instanceof Denied
          ? e.message
          : "Не удалось выполнить действие. Попробуйте позже.",
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
