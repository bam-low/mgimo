import { actor, failure } from "@/server/security";
import { readSchedule } from "@/server/schedule";
export async function GET(request: Request) {
  try {
    const a = await actor(request.headers),
      p = new URL(request.url).searchParams;
    const data = await readSchedule(a, {
      day: p.get("day") ?? undefined,
      view: p.get("view") ?? undefined,
      groupId: p.get("groupId") ?? undefined,
    });
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
