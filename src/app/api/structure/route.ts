import { db } from "@/server/db";
import { failure } from "@/server/errors";
export async function GET() {
  try {
    return Response.json(
      await db.university.findMany({
        where: { id: "demo-university", active: true },
        select: {
          id: true,
          name: true,
          faculties: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              programs: {
                where: { active: true },
                select: {
                  id: true,
                  name: true,
                  groups: {
                    where: { active: true },
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
