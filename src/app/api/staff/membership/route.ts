import { changeMembership, membershipAction } from "@/server/membership";
import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  failure,
  limited,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("membership-action:" + a.user.id, 60, 60000);
    const input = membershipAction.parse(await readJSON(request));
    await changeMembership(a.user.id, a.membership.universityId, input);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
