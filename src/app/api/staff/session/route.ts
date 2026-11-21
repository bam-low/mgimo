import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { changeExam } from "@/server/session";

/** Сотрудник: назначить, перенести или отменить экзамен. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("session-write:" + a.user.id, 60, 60000);
    return Response.json(await changeExam(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
