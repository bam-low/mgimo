import { expect, it } from "vitest";
import { assignmentBlocks } from "./teaching-assignment";
it("catalog keeps shared lectures whole, seminars separate, and explains inactive references", () => {
  const catalog: Parameters<typeof assignmentBlocks>[0] = {
    semesters: [],
    rooms: [],
    subjects: [{ id: "s", name: "Демо математика", active: true }],
    teachers: [
      { id: "t1", name: "Демо А", active: true, version: 1, subjectIds: ["s"] },
      { id: "t2", name: "Демо Б", active: true, version: 1, subjectIds: ["s"] },
    ],
    faculties: [
      {
        id: "f",
        name: "Демо факультет",
        active: true,
        programs: [
          {
            id: "p",
            name: "Демо направление",
            active: true,
            groups: [
              { id: "g1", name: "Демо 1", active: true, course: 1 },
              { id: "g2", name: "Демо 2", active: true, course: 2 },
              { id: "g3", name: "Демо новая", active: true, course: null },
            ],
          },
        ],
      },
    ],
    assignments: [
      {
        id: "lecture",
        programId: "p",
        subjectId: "s",
        kind: "LECTURE",
        active: true,
        version: 1,
        groups: [
          { groupId: "g1", teacherId: "t1" },
          { groupId: "g2", teacherId: "t1" },
        ],
      },
      {
        id: "seminar",
        programId: "p",
        subjectId: "s",
        kind: "SEMINAR",
        active: true,
        version: 1,
        groups: [
          { groupId: "g1", teacherId: "t1" },
          { groupId: "g2", teacherId: "t2" },
        ],
      },
    ],
  };
  const blocks = assignmentBlocks(catalog, "p", "g1");
  expect(blocks).toHaveLength(2);
  expect(blocks[0].groupIds).toEqual(["g1", "g2"]);
  expect(blocks[1].groupIds).toEqual(["g1"]);
  expect(assignmentBlocks(catalog, "p", "g3")).toEqual([]);
  expect(assignmentBlocks(catalog, "other")).toEqual([]);
  catalog.teachers[0].subjectIds = [];
  expect(assignmentBlocks(catalog, "p", "g1")[0].reason).toContain("не связан");
  catalog.teachers[0].active = false;
  expect(assignmentBlocks(catalog, "p", "g1")[0].reason).toContain("неактивен");
  catalog.subjects[0].active = false;
  expect(assignmentBlocks(catalog, "p", "g1")[0].reason).toContain(
    "Дисциплина неактивна",
  );
});
