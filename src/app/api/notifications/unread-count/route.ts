import { notificationHTTP } from "@/server/notification-http";
export const GET = (r: Request) => notificationHTTP(r, "count");
