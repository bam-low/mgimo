import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import {
  changeBuilder,
  builderCatalog,
  builderWeek,
} from "@/server/semester-builder";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("semester-write:" + a.user.id, 60, 60000);
    return Response.json(
      await changeBuilder(
        a.user.id,
        a.membership.universityId,
        await readJSON(request),
      ),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const a = await actor(request.headers);
    staff(a);
    await limited("semester-read:" + a.user.id, 180, 60000);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(
      Object.keys(params).length
        ? await builderWeek(a.membership.universityId, params)
        : await builderCatalog(a.membership.universityId),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
