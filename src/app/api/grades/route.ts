import { actor, failure } from "@/server/security";
import { readGrades } from "@/server/grades";
export async function GET(request: Request) {
  try {
    const a = await actor(request.headers),
      q = new URL(request.url).searchParams;
    return Response.json(
      await readGrades(a, {
        membershipId: q.get("membershipId") ?? undefined,
        cursor: q.get("cursor") ?? undefined,
        auditCursor: q.get("auditCursor") ?? undefined,
        from: q.get("from") ?? undefined,
        to: q.get("to") ?? undefined,
        subjectId: q.get("subjectId") ?? undefined,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
