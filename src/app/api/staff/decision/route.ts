import { z } from "zod";
import { decide } from "@/server/enrollment";
import {
  actor,
  staff,
  readJSON,
  sameOrigin,
  failure,
  limited,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("decision:" + a.user.id, 60, 60000);
    const d = z
      .object({
        requestId: z.string().max(100),
        status: z.enum(["APPROVED", "REJECTED"]),
        reason: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(await readJSON(request));
    await decide(
      a.user.id,
      a.membership.universityId,
      d.requestId,
      d.status,
      d.reason,
    );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
