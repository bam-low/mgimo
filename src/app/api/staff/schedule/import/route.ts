import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { importSchedule } from "@/server/schedule-import";

/** Предпросмотр (confirm: false) или публикация (confirm: true) расписания из CSV. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("schedule-import:" + a.user.id, 20, 60000);
    return Response.json(
      await importSchedule(a, await readJSON(request, 600_000)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
