import { it, expect, vi, afterEach } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw Error("AUTH_REDIRECT");
  },
  notFound: () => {
    throw Error("NOT_FOUND");
  },
}));
import { protectedPage } from "../server/page";
import { Denied } from "../server/errors";
afterEach(() => vi.restoreAllMocks());
it("only denies redirect to login; outages have a safe retryable boundary without leaking cause", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    protectedPage(async () => {
      throw new Denied(401);
    }),
  ).rejects.toThrow("AUTH_REDIRECT");
  await expect(
    protectedPage(async () => {
      throw new Denied(404);
    }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    protectedPage(async () => {
      throw Error("postgresql://private:secret@example.test");
    }),
  ).rejects.toThrow("Сервис временно недоступен");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  expect(await protectedPage(async () => 42)).toBe(42);
});
