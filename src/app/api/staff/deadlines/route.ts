import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { changeDeadline } from "@/server/deadlines";

/** Сотрудник: опубликовать или отменить дедлайн. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("deadline-write:" + a.user.id, 60, 60000);
    return Response.json(await changeDeadline(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
