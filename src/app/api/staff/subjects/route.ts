import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { changeSubject } from "@/server/grades";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("subjects-write:" + a.user.id, 60, 60000);
    return Response.json(
      await changeSubject(
        a.user.id,
        a.membership.universityId,
        await readJSON(request),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
