import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { lessonInput, changeLesson } from "@/server/schedule";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("schedule-write:" + a.user.id, 60, 60000);
    const d = lessonInput.parse(await readJSON(request));
    return Response.json(
      await changeLesson(a.user.id, a.membership.universityId, d),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
