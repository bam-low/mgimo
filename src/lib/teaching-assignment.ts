import type { builderCatalog } from "@/server/semester-builder";
type Catalog = Awaited<ReturnType<typeof builderCatalog>>;
export function assignmentBlocks(
  catalog: Catalog,
  programId: string,
  groupId = "",
) {
  const faculty = catalog.faculties.find((f) =>
    f.programs.some((p) => p.id === programId),
  );
  const program = faculty?.programs.find((p) => p.id === programId);
  return catalog.assignments
    .filter((a) => a.programId === programId)
    .flatMap((a) => {
      const subject = catalog.subjects.find((s) => s.id === a.subjectId);
      const rows = a.kind === "LECTURE" ? [a.groups] : a.groups.map((g) => [g]);
      return rows
        .filter((rows) => !groupId || rows.some((g) => g.groupId === groupId))
        .map((rows) => {
          const teacher = catalog.teachers.find(
            (t) => t.id === rows[0]?.teacherId,
          );
          const reason = !a.active
            ? "Настройка выключена"
            : !subject?.active
              ? "Дисциплина неактивна"
              : !faculty?.active || !program?.active
                ? "Направление неактивно"
                : rows.some(
                      (g) =>
                        !program.groups.find((x) => x.id === g.groupId)?.active,
                    )
                  ? "Группа неактивна"
                  : !teacher?.active
                    ? "Преподаватель неактивен"
                    : !teacher.subjectIds.includes(a.subjectId)
                      ? "Преподаватель не связан с дисциплиной"
                      : "";
          const groupNames = rows.map(
            (g) =>
              program?.groups.find((x) => x.id === g.groupId)?.name ?? "Группа",
          );
          return {
            key: a.id + (a.kind === "SEMINAR" ? ":" + rows[0].groupId : ""),
            assignment: a,
            groupIds: rows.map((g) => g.groupId),
            teacherId: rows[0]?.teacherId ?? "",
            reason,
            title: subject?.name ?? "Дисциплина",
            teacher: teacher?.name ?? "Не назначен",
            groupNames,
            label: `${subject?.name} · ${a.kind === "LECTURE" ? "Лекция" : "Семинар"} · ${teacher?.name} · ${groupNames.join(", ")}`,
          };
        });
    });
}
