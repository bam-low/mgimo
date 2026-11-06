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
    version: z.number().int().positive().optional(),
  })
  .strict();
export async function changeStructure(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = structureInput.parse(input);
  if (
    (d.id && (!d.version || d.parentId)) ||
    (!d.id && (d.version || !d.operationId))
  )
    throw new Denied(400);
  return db.$transaction(async (tx) => {
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
      const data = {
        name: d.name,
        active: d.active,
        version: { increment: 1 },
      };
      if (d.kind === "faculty")
        await tx.faculty.update({ where: { id: d.id }, data });
      else if (d.kind === "program")
        await tx.program.update({ where: { id: d.id }, data });
      else await tx.studentGroup.update({ where: { id: d.id }, data });
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
            select: { id: true, name: true, active: true, version: true },
          },
        },
      },
    },
  });
}
