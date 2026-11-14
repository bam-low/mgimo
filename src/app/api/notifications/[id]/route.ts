import { notificationHTTP } from "@/server/notification-http";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return notificationHTTP(r, "detail", (await c.params).id);
}
