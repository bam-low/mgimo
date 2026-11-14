import { notificationHTTP } from "@/server/notification-http";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return notificationHTTP(r, "read", (await c.params).id);
}
