import { headers } from "next/headers";
import { actor } from "@/server/security";
import { notificationCount } from "@/server/notifications";
import { reportFailure, Denied } from "@/server/errors";
import { NotificationEntry } from "./notification-controls";
export async function NotificationBadge() {
  let count: number | null = null;
  try {
    count = (await notificationCount(await actor(await headers()))).count;
  } catch (e) {
    if (!(e instanceof Denied)) reportFailure(e);
  }
  return <NotificationEntry initialCount={count} />;
}
