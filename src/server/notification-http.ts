import {
  actor,
  sameOrigin,
  readJSON,
  limited,
  requestSource,
  failure,
  Denied,
} from "./security";
import {
  listNotifications,
  notificationCount,
  notificationDetail,
  readNotification,
} from "./notifications";
export async function notificationHTTP(
  request: Request,
  mode: "list" | "count" | "detail" | "read",
  id?: string,
) {
  try {
    if (mode === "read") sameOrigin(request);
    const a = await actor(request.headers);
    if (a.membership.role !== "STUDENT") throw new Denied();
    const write = mode === "read",
      source = requestSource(request);
    await limited(
      `notification-${write ? "write" : "read"}-source:${source}`,
      write ? 120 : 240,
      60000,
    );
    await limited(
      `notification-${write ? "write" : "read"}-member:${a.membership.id}`,
      write ? 60 : 120,
      60000,
    );
    const q = Object.fromEntries(new URL(request.url).searchParams);
    if (mode !== "list" && Object.keys(q).length) throw new Denied(400);
    const data =
      mode === "list"
        ? await listNotifications(a, q)
        : mode === "count"
          ? await notificationCount(a)
          : mode === "detail"
            ? await notificationDetail(a, id!)
            : await readNotification(a, id!, await readJSON(request));
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
