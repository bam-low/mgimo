import { actor, limited, failure, Denied } from "@/server/security";
import { portfolioFile } from "@/server/portfolio";

/** PDF работы портфолио (владелец или деканат). */
export async function GET(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    if (new URL(request.url).search) throw new Denied(400);
    const a = await actor(request.headers);
    await limited("portfolio-download:" + a.user.id, 60, 60000);
    const f = await portfolioFile(a, (await c.params).id);
    return new Response(new Uint8Array(f.content), { headers: f.headers });
  } catch (e) {
    return failure(e);
  }
}
