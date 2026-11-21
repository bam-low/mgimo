import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { changeAnnouncement } from "@/server/announcements";

/** Создать или удалить объявление (только сотрудник своего вуза). */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("announcement-write:" + a.user.id, 30, 60000);
    return Response.json(await changeAnnouncement(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
