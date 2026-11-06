import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { structureInput, changeStructure } from "@/server/structure";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("structure-write:" + a.user.id, 60, 60000);
    const d = structureInput.parse(await readJSON(request));
    return Response.json(
      await changeStructure(a.user.id, a.membership.universityId, d),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
