import { actor, studentAccess, failure, Denied } from "@/server/security";
export async function GET(r: Request) {
  try {
    const a = await actor(r.headers);
    const e = studentAccess(a);
    const id = new URL(r.url).searchParams.get("id");
    if (id && id !== e.groupId) throw new Denied();
    return Response.json(
      { id: e.groupId, name: e.group.name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
