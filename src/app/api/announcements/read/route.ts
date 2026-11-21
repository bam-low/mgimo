import {
  actor,
  sameOrigin,
  readJSON,
  limited,
  requestSource,
  failure,
} from "@/server/security";
import { markAnnouncementRead } from "@/server/announcements";

/** Студент отмечает объявление прочитанным — оно уходит с его главной. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(request.headers);
    await limited(
      `announcement-read-source:${requestSource(request)}`,
      120,
      60000,
    );
    await limited(`announcement-read-member:${a.membership.id}`, 60, 60000);
    return Response.json(
      await markAnnouncementRead(a, await readJSON(request)),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
