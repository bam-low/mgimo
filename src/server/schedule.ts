import { z } from "zod";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import { lockUniversity, requireStaff, validGroup } from "./enrollment-guards";
import {
  localInstant,
  dayKey,
  validDay,
  addDays,
  monday,
} from "@/lib/schedule-time";
const id = z.string().min(1).max(100);
const fields = {
  groupId: id,
  title: z.string().trim().min(1).max(160),
  teacher: z.string().trim().max(120),
  room: z.string().trim().max(80),
  day: z.string().refine(validDay),
  start: z.string().max(5),
  end: z.string().max(5),
};
export const lessonInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE"), ...fields }).strict(),
  z
    .object({
      action: z.literal("EDIT"),
      id,
      version: z.number().int().positive(),
      ...fields,
    })
    .strict(),
  z
    .object({
      action: z.enum(["CANCEL", "RESTORE", "DELETE"]),
      id,
      version: z.number().int().positive(),
    })
    .strict(),
]);
export async function changeLesson(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = lessonInput.parse(input);
  return db.$transaction(async (tx) => {
    await lockUniversity(tx, universityId);
    await requireStaff(tx, actorId, universityId);
    const current =
      d.action !== "CREATE"
        ? await tx.scheduleEntry.findFirst({
            where: {
              id: d.id,
              group: { program: { faculty: { universityId } } },
            },
          })
        : null;
    if (d.action !== "CREATE" && (!current || current.status === "DELETED"))
      throw new Denied(404);
    if (current && current.version !== (d as { version: number }).version)
      throw new Denied(409);
    const groupId =
      d.action === "CREATE" || d.action === "EDIT"
        ? d.groupId
        : current!.groupId;
    await validGroup(
      tx,
      groupId,
      universityId,
      d.action !== "CANCEL" && d.action !== "DELETE",
    );
    const uni = await tx.university.findUniqueOrThrow({
      where: { id: universityId },
    });
    let startsAt = current?.startsAt,
      endsAt = current?.endsAt;
    if (d.action === "CREATE" || d.action === "EDIT") {
      try {
        startsAt = localInstant(d.day, d.start, uni.timezone);
        endsAt = localInstant(d.day, d.end, uni.timezone);
      } catch {
        throw new Denied(400);
      }
      if (endsAt <= startsAt) throw new Denied(400);
    }
    const status =
      d.action === "CANCEL"
        ? "CANCELLED"
        : d.action === "DELETE"
          ? "DELETED"
          : d.action === "RESTORE" || d.action === "CREATE"
            ? "SCHEDULED"
            : current!.status;
    if (
      (d.action === "CANCEL" && current?.status !== "SCHEDULED") ||
      (d.action === "RESTORE" && current?.status !== "CANCELLED")
    )
      throw new Denied(409);
    if (
      status === "SCHEDULED" &&
      (await tx.scheduleEntry.findFirst({
        where: {
          groupId,
          status: "SCHEDULED",
          id: { not: current?.id ?? "" },
          startsAt: { lt: endsAt! },
          endsAt: { gt: startsAt! },
        },
      }))
    )
      throw new Denied(409);
    const data = {
      groupId,
      startsAt: startsAt!,
      endsAt: endsAt!,
      status,
      ...(d.action === "CREATE" || d.action === "EDIT"
        ? { title: d.title, teacher: d.teacher || null, room: d.room || null }
        : {}),
    };
    const lesson = current
      ? await tx.scheduleEntry.update({
          where: { id: current.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.scheduleEntry.create({
          data: { ...data, title: (d as { title: string }).title },
        });
    await tx.auditLog.create({
      data: {
        actorId,
        universityId,
        targetId: lesson.id,
        action: "LESSON_" + d.action,
        oldGroupId: current?.groupId,
        newGroupId: groupId,
      },
    });
    return { id: lesson.id };
  });
}
export async function readSchedule(
  a: Awaited<ReturnType<typeof actor>>,
  query: { day?: string; view?: string; groupId?: string },
) {
  const zone = a.membership.university.timezone;
  const today = dayKey(new Date(), zone),
    requested = query.day ?? today;
  if (
    !validDay(requested) ||
    (query.view && !["today", "week"].includes(query.view))
  )
    throw new Denied(400);
  let groupId: string;
  if (a.membership.role === "STAFF") {
    staff(a);
    groupId = query.groupId ?? "group-1";
    await validGroup(db, groupId, a.membership.universityId, false);
  } else {
    groupId = studentAccess(a).groupId;
    if (query.groupId && query.groupId !== groupId) throw new Denied();
  }
  const from = query.view === "week" ? monday(requested) : requested,
    to = addDays(from, query.view === "week" ? 7 : 1);
  const lessons = await db.scheduleEntry.findMany({
    where: {
      groupId,
      status: { not: "DELETED" },
      startsAt: {
        gte: localInstant(from, "00:00", zone),
        lt: localInstant(to, "00:00", zone),
      },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 501,
    select: {
      id: true,
      title: true,
      teacher: true,
      room: true,
      startsAt: true,
      endsAt: true,
      status: true,
      version: true,
    },
  });
  if (lessons.length > 500) throw new Denied(413);
  const group = await db.studentGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { name: true },
  });
  return {
    groupId,
    groupName: group.name,
    timezone: zone,
    from,
    today,
    view: query.view ?? "today",
    serverNow: new Date().toISOString(),
    lessons: lessons.map((l) => ({
      ...l,
      startsAt: l.startsAt.toISOString(),
      endsAt: l.endsAt.toISOString(),
    })),
  };
}
