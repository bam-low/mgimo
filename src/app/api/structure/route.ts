import { db } from "@/server/db";
export async function GET() {
  return Response.json(
    await db.university.findMany({
      where: { id: "demo-university", active: true },
      select: {
        id: true,
        name: true,
        faculties: {
          where: { id: { in: ["faculty-1", "faculty-2"] } },
          select: {
            id: true,
            name: true,
            programs: {
              where: { id: { in: ["program-1", "program-2"] } },
              select: {
                id: true,
                name: true,
                groups: {
                  where: { active: true, id: { in: ["group-1", "group-2"] } },
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
}
