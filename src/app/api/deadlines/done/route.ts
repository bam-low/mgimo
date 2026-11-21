import {
  actor,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { markDeadline } from "@/server/deadlines";

/** Студент: отметка «Сделано» для своего дедлайна. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    await limited("deadline-done:" + a.user.id, 60, 60000);
    return Response.json(await markDeadline(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
