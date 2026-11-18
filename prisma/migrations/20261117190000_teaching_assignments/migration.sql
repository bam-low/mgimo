-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingAssignmentGroup" (
    "assignmentId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TeachingAssignmentGroup_pkey" PRIMARY KEY ("assignmentId","groupId")
);

-- CreateIndex
CREATE INDEX "TeachingAssignment_universityId_idx" ON "TeachingAssignment"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingAssignment_id_universityId_key" ON "TeachingAssignment"("id", "universityId");

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectId_universityId_fkey" FOREIGN KEY ("subjectId", "universityId") REFERENCES "Subject"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignmentGroup" ADD CONSTRAINT "TeachingAssignmentGroup_assignmentId_universityId_fkey" FOREIGN KEY ("assignmentId", "universityId") REFERENCES "TeachingAssignment"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignmentGroup" ADD CONSTRAINT "TeachingAssignmentGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignmentGroup" ADD CONSTRAINT "TeachingAssignmentGroup_teacherId_universityId_fkey" FOREIGN KEY ("teacherId", "universityId") REFERENCES "Teacher"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_kind_check" CHECK ("kind" IN ('LECTURE','SEMINAR'));
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_version_check" CHECK ("version" > 0);
