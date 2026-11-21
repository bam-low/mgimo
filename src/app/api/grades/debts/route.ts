import {
  actor,
  sameOrigin,
  readJSON,
  limited,
  requestSource,
  failure,
} from "@/server/security";
import { setDebtHidden } from "@/server/debts";

/** Скрыть или вернуть долг в списке «Можно исправить». */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    await limited(`debt-write-source:${requestSource(request)}`, 120, 60000);
    await limited(`debt-write-member:${a.membership.id}`, 60, 60000);
    return Response.json(await setDebtHidden(a, await readJSON(request)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
