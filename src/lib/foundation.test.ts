import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { Denied, failure } from "../server/errors";
import { universityDate } from "./time";
import { listCursor, listPage, pageSize } from "./pagination";
afterEach(() => vi.restoreAllMocks());
describe("shared foundation boundaries", () => {
  it("formats the university calendar date independently of the host/browser zone", () => {
    const instant = new Date("2026-01-01T00:30:00Z");
    expect(universityDate(instant, "Europe/Moscow")).toBe("01.01.2026");
    expect(universityDate(instant, "America/Los_Angeles")).toBe("31.12.2025");
    expect(() => universityDate(instant, "invalid-zone")).toThrow();
  });
  it("bounds list pages and rejects malformed client cursor objects", () => {
    const rows = Array.from({ length: pageSize + 1 }, (_, i) => ({
      id: String(i),
    }));
    expect(listPage(rows).items).toHaveLength(pageSize);
    expect(listPage(rows).next).toBe(String(pageSize - 1));
    expect(listPage(rows.slice(0, 2)).next).toBeUndefined();
    for (const input of [undefined, ["id"], "x".repeat(101), "../secret"])
      expect(listCursor(input)).toBeUndefined();
    expect(listCursor("demo-request_1")).toBe("demo-request_1");
  });
  it("separates client denial, validation, conflict and outage without exposing causes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(failure(new Denied(403)).status).toBe(403);
    const validation = z.string().safeParse(12);
    if (validation.success) throw Error();
    expect(failure(validation.error).status).toBe(400);
    expect(failure(new SyntaxError("private input")).status).toBe(400);
    expect(failure({ code: "P2002", message: "private URL" }).status).toBe(409);
    const response = failure({
      code: "P1001",
      message: "postgresql://private:secret@example.test",
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("campus.operation_failed", {
      category: "database",
      code: "P1001",
    });
    expect(failure(new Error("private stack")).status).toBe(500);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private stack");
  });
});
