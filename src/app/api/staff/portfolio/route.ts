import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { decidePortfolio } from "@/server/portfolio";

/** Деканат: подтвердить или отклонить работу портфолио. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    staff(a);
    await limited("portfolio-review:" + a.user.id, 60, 60000);
    return Response.json(await decidePortfolio(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
