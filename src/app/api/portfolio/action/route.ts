import {
  actor,
  sameOrigin,
  readJSON,
  limited,
  failure,
} from "@/server/security";
import { actOnOwnPortfolio } from "@/server/portfolio";

/** Студент: отправить работу на модерацию или удалить скрытую. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    await limited("portfolio-write:" + a.user.id, 30, 60000);
    return Response.json(await actOnOwnPortfolio(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
