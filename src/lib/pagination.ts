import { z } from "zod";
export const pageSize = 25;
// Opaque IDs, not arbitrary Prisma where/orderBy from the client.
export const cursorId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export function listCursor(value: string | string[] | undefined) {
  const parsed = cursorId.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export function listPage<T extends { id: string }>(rows: T[]) {
  const items = rows.slice(0, pageSize);
  return { items, next: rows.length > pageSize ? items.at(-1)!.id : undefined };
}
