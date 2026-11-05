import { timingSafeEqual } from "node:crypto";
import { cleanupRateBuckets } from "@/server/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const headers = { "Cache-Control": "private, no-store" };
  if (!secret || secret.length < 32)
    return Response.json({ error: "Unavailable" }, { status: 503, headers });
  const expected = Buffer.from("Bearer " + secret);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unavailable" }, { status: 401, headers });
  try {
    let removed = 0;
    const deadline = Date.now() + 10000;
    for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
      const count = await cleanupRateBuckets();
      removed += count;
      if (!count) break;
    }
    return Response.json({ removed }, { headers });
  } catch {
    return Response.json({ error: "Unavailable" }, { status: 503, headers });
  }
}
