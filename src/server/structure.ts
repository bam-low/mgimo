import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { Denied } from "./errors";
import { lockUniversity, requireStaff } from "./enrollment-guards";
const id = z.string().min(1).max(100);
export const structureInput = z
  .object({
    kind: z.enum(["faculty", "program", "group"]),
    operationId: z.uuid().optional(),
    id: id.optional(),
    parentId: id.optional(),
    name: z.string().trim().min(1).max(120),
    active: z.boolean(),
    course: z.number().int().positive().max(2147483647).nullable().optional(),
    action: z.literal("DELETE").optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
export async function changeStructure(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = structureInput.parse(input);
  if ((d.course !== undefined && d.kind !== "group") || (d.action && !d.id))
    throw new Denied(400);
  if (
    (d.id && (!d.version || d.parentId)) ||
    (!d.id && (d.version || !d.operationId))
  )
    throw new Denied(400);
  return db
    .$transaction(async (tx) => {
      await lockUniversity(tx, universityId);
      await requireStaff(tx, actorId, universityId);
      let target: string;
      const scope = { program: { faculty: { universityId } } };
      if (d.id) {
        const record =
          d.kind === "faculty"
            ? await tx.faculty.findFirst({ where: { id: d.id, universityId } })
            : d.kind === "program"
              ? await tx.program.findFirst({
                  where: { id: d.id, faculty: { universityId } },
                })
              : await tx.studentGroup.findFirst({
                  where: { id: d.id, ...scope },
                });
        if (!record) throw new Denied(404);
        if (record.version !== d.version) throw new Denied(409);
        if (d.action === "DELETE") {
          const dependencies =
            d.kind === "faculty"
              ? await tx.program.count({ where: { facultyId: d.id } })
              : d.kind === "program"
                ? (await tx.studentGroup.count({
                    where: { programId: d.id },
                  })) +
                  (await tx.scheduleTemplate.count({
                    where: { programId: d.id },
                  })) +
                  (await tx.teachingAssignment.count({
                    where: { programId: d.id },
                  }))
                : (await tx.enrollmentRequest.count({
                    where: { targetGroupId: d.id },
                  })) +
                  (await tx.groupMembership.count({
                    where: { groupId: d.id },
                  })) +
                  (await tx.scheduleEntry.count({ where: { groupId: d.id } })) +
                  (await tx.scheduleGroup.count({ where: { groupId: d.id } })) +
                  (await tx.templateGroup.count({ where: { groupId: d.id } })) +
                  (await tx.teachingAssignmentGroup.count({
                    where: { groupId: d.id },
                  })) +
                  (await tx.scheduleCancellation.count({
                    where: { groupIds: { array_contains: [d.id] } },
                  })) +
                  (await tx.application.count({
                    where: { submittedGroupId: d.id },
                  }));
          if (dependencies) {
            const error = new Denied(409);
            error.message = `Удаление недоступно: ${d.kind === "faculty" ? "с факультетом связаны направления" : d.kind === "program" ? "с направлением связаны группы, серии расписания или закрепления дисциплин" : "с группой связаны прикрепления, обращения, занятия или учебная история"} (${dependencies}). Используйте архивирование.`;
            throw error;
          }
          if (d.kind === "faculty")
            await tx.faculty.delete({ where: { id: d.id } });
          else if (d.kind === "program")
            await tx.program.delete({ where: { id: d.id } });
          else await tx.studentGroup.delete({ where: { id: d.id } });
          await tx.auditLog.create({
            data: {
              actorId,
              universityId,
              targetId: d.id,
              action: "STRUCTURE_DELETED",
              reason: d.kind,
            },
          });
          return { id: d.id };
        }
        const data = {
          name: d.name,
          active: d.active,
          version: { increment: 1 },
        };
        if (d.kind === "faculty")
          await tx.faculty.update({ where: { id: d.id }, data });
        else if (d.kind === "program")
          await tx.program.update({ where: { id: d.id }, data });
        else
          await tx.studentGroup.update({
            where: { id: d.id },
            data: {
              ...data,
              ...(d.course !== undefined ? { course: d.course } : {}),
            },
          });
        target = d.id;
      } else {
        const newId = randomUUID();
        if (d.kind === "faculty") {
          if (d.parentId) throw new Denied(400);
          await tx.faculty.create({
            data: { id: newId, universityId, name: d.name, active: d.active },
          });
        } else if (d.kind === "program") {
          const parent = await tx.faculty.findFirst({
            where: { id: d.parentId ?? "", universityId, active: true },
          });
          if (!parent) throw new Denied();
          await tx.program.create({
            data: {
              id: newId,
              facultyId: parent.id,
              name: d.name,
              active: d.active,
            },
          });
        } else {
          const parent = await tx.program.findFirst({
            where: {
              id: d.parentId ?? "",
              active: true,
              faculty: { universityId, active: true },
            },
          });
          if (!parent) throw new Denied();
          await tx.studentGroup.create({
            data: {
              id: newId,
              programId: parent.id,
              course: d.course,
              name: d.name,
              active: d.active,
            },
          });
        }
        target = newId;
      }
      await tx.auditLog.create({
        data: {
          ...(d.id ? {} : { id: d.operationId }),
          actorId,
          universityId,
          targetId: target,
          action: d.id
            ? d.active
              ? "STRUCTURE_UPDATED"
              : "STRUCTURE_DEACTIVATED"
            : "STRUCTURE_CREATED",
          reason: d.kind,
        },
      });
      return { id: target };
    })
    .catch((error: unknown) => {
      if (
        d.action === "DELETE" &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2003"
      ) {
        const denied = new Denied(409);
        denied.message =
          "Появилась связанная запись. Удаление отменено; используйте архивирование.";
        throw denied;
      }
      throw error;
    });
}
export async function staffStructure(universityId: string) {
  return db.faculty.findMany({
    where: { universityId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      active: true,
      version: true,
      programs: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          active: true,
          version: true,
          groups: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              active: true,
              version: true,
              course: true,
            },
          },
        },
      },
    },
  });
}
